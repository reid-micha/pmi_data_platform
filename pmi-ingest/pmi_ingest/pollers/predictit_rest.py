"""PredictIt REST poller.

Ported from [`micah/server/app/sources/predictit.py`](../../../micah/server/app/sources/predictit.py),
adapted to write into the pmi-core schema. PredictIt exposes its entire
universe in one call (`/api/marketdata/all/`) — a small dataset, no
pagination. Each *market* fans out into multiple *contracts* (one per
candidate / outcome); we persist one `core_markets` row per contract,
keyed `predictit:<contract_id>`.

Resolution
----------
PredictIt contract `status` is "Open" / "Closed"; a market-level status also
exists. A non-open status (at either level) means the outcome is decided
even while still listed, so we stamp `resolution='CLOSED'`.
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

VENUE = "predictit"
SOURCE = "predictit-rest"

ALL_MARKETS_PATH = "/api/marketdata/all/"


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, datetime):
            return value
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


def _contract_title(market: dict[str, Any], contract: dict[str, Any]) -> str:
    market_name = market.get("name", "")
    contract_name = contract.get("name", "")
    if contract_name and contract_name != market_name:
        return f"{market_name} - {contract_name}"
    return market_name or "(untitled)"


async def _get_json(client: httpx.AsyncClient) -> dict[str, Any]:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(ALL_MARKETS_PATH, timeout=30.0)
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
    contract_id = str(contract.get("id") or "")
    if not contract_id:
        raise ValueError(f"predictit contract missing id: keys={list(contract)[:6]}")
    external_id = contract_id

    raw = {"market": market.get("name"), "contract": contract, "url": market.get("url")}
    closes_at = _parse_dt(market.get("dateEnd"))

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=external_id,
        title=_contract_title(market, contract)[:1024],
        description=None,
        category=None,
        tags=None,
        opens_at=None,
        closes_at=closes_at,
        resolved_at=None,
        resolution="CLOSED" if is_closed else None,
        raw=raw,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "closes_at": stmt.excluded.closes_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)
    market_id = (await session.execute(stmt)).scalar_one()

    stub = CoreMarket()
    stub.id = market_id
    stub.venue = VENUE
    stub.external_id = external_id
    return stub


async def _write_price(
    session: AsyncSession, market: CoreMarket, contract: dict[str, Any]
) -> bool:
    """PredictIt reports `lastTradePrice` (0..1) and no volume."""
    last = _parse_float(contract.get("lastTradePrice"))
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


class PredictItRestPoller:
    """Implements `pmi_ingest.pollers.Poller` for PredictIt."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.predictit_base_url

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        log.info("predictit.poll_start", base_url=self._base_url)
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, follow_redirects=True
            ) as client:
                data = await _get_json(client)
                markets = data.get("markets") or []

                async with session_scope() as session:
                    for m in markets:
                        market_status = (m.get("status") or "").lower()
                        market_closed = bool(market_status) and market_status != "open"
                        for c in m.get("contracts") or []:
                            try:
                                cstatus = (c.get("status") or "").lower()
                                is_closed = market_closed or (
                                    bool(cstatus) and cstatus != "open"
                                )
                                market = await _upsert_contract(
                                    session, m, c, is_closed=is_closed
                                )
                                await _write_price(session, market, c)
                                total += 1
                            except Exception as inner:
                                log.warning(
                                    "predictit.market_skip",
                                    error=str(inner),
                                    contract_id=c.get("id"),
                                )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("predictit.poll_failed", error=error_message)
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
            "predictit.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
