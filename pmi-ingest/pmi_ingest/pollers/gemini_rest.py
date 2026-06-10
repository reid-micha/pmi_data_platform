"""Gemini prediction-markets REST poller.

Ported from [`micah/server/app/sources/gemini.py`](../../../micah/server/app/sources/gemini.py),
adapted to write into the pmi-core schema. Gemini exposes its whole
prediction-market universe under one endpoint
(`exchange.gemini.com/prediction-markets`, JSON under `data`). Each *market*
fans out into multiple *contracts* (one per outcome); we persist one
`core_markets` row per contract keyed `gemini:<market_id>:<contract_id>`.

Probability
-----------
Gemini reports a per-outcome buy/sell book; we use `prices.buy.yes` as the
probability, matching the legacy normalizer.

Resolution
----------
Market/contract `status` is "active" vs anything else (closed/settled). A
non-active status at either level → `resolution='CLOSED'`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket, TsPriceSnapshot
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll

log = structlog.get_logger(__name__)

VENUE = "gemini"
SOURCE = "gemini-rest"

MARKETS_PATH = "/prediction-markets"


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            ts = float(value)
            if ts > 1e12:
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=UTC)
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _get_json(client: httpx.AsyncClient) -> dict[str, Any]:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(MARKETS_PATH, timeout=20.0)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, dict) else {}
    return {}  # unreachable


async def _upsert_contract(
    session: AsyncSession,
    market: dict[str, Any],
    contract: dict[str, Any],
    *,
    is_closed: bool,
) -> CoreMarket:
    market_id = str(market.get("id") or "")
    contract_id = str(contract.get("id") or "")
    if not market_id or not contract_id:
        raise ValueError(
            f"gemini contract missing id: market={market_id!r} contract={contract_id!r}"
        )
    external_id = f"{market_id}:{contract_id}"

    market_title = market.get("title", "")
    title = f"{market_title} - {contract.get('label', '')}".strip(" -") or "(untitled)"
    slug = market.get("slug", "")
    url = f"https://exchange.gemini.com/predictions/{slug}" if slug else None
    raw = {"market_id": market_id, "contract": contract, "url": url}

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=external_id,
        title=title[:1024],
        description=None,
        category=market.get("category"),
        tags=None,
        opens_at=None,
        closes_at=_parse_dt(contract.get("expiryDate")),
        resolved_at=None,
        resolution="CLOSED" if is_closed else None,
        raw=raw,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "category": stmt.excluded.category,
            "closes_at": stmt.excluded.closes_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)
    cid = (await session.execute(stmt)).scalar_one()

    stub = CoreMarket()
    stub.id = cid
    stub.venue = VENUE
    stub.external_id = external_id
    return stub


async def _write_price(
    session: AsyncSession, market: CoreMarket, contract: dict[str, Any]
) -> bool:
    """Gemini `prices.buy.yes` is the probability (0..1); no volume field."""
    prices = contract.get("prices") or {}
    buy_yes = (prices.get("buy") or {}).get("yes") if isinstance(prices, dict) else None
    last = _parse_float(buy_yes)
    if last is None:
        return False
    session.add(
        TsPriceSnapshot(
            market_id=market.id,
            snapshot_at=datetime.now(UTC),
            last_price=last,
        )
    )
    return True


class GeminiRestPoller:
    """Implements `pmi_ingest.pollers.Poller` for Gemini."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.gemini_base_url

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        log.info("gemini.poll_start", base_url=self._base_url)
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, follow_redirects=True
            ) as client:
                data = await _get_json(client)
                markets = data.get("data") or []

                async with session_scope() as session:
                    for m in markets:
                        market_status = (m.get("status") or "").lower()
                        market_closed = bool(market_status) and market_status != "active"
                        for c in m.get("contracts") or []:
                            try:
                                cstatus = (c.get("status") or "").lower()
                                is_closed = market_closed or (
                                    bool(cstatus) and cstatus != "active"
                                )
                                market = await _upsert_contract(
                                    session, m, c, is_closed=is_closed
                                )
                                await _write_price(session, market, c)
                                total += 1
                            except Exception as inner:
                                log.warning(
                                    "gemini.market_skip",
                                    error=str(inner),
                                    market_id=m.get("id"),
                                    contract_id=c.get("id"),
                                )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("gemini.poll_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=total if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=None,
                )

        log.info(
            "gemini.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
