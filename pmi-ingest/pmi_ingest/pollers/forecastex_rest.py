"""ForecastEx REST poller.

Ported from [`micah/server/app/sources/forecastex.py`](../../../micah/server/app/sources/forecastex.py),
adapted to write into the pmi-core schema instead of Micah's NormalizedContract.
Shares the shape of [`metaculus_rest.py`](./metaculus_rest.py): async httpx +
tenacity retries + `ON CONFLICT DO UPDATE` upserts on `(venue, external_id)` +
`record_poll` audit row per cycle.

Doubly-encoded payload
----------------------
ForecastEx's `/api/contracts` wraps the contract list in two layers of
JSON-as-string: the response `body` may itself be a JSON string, and inside
it `data` is *also* a JSON-encoded string. `_parse_contracts_payload` peels
both layers defensively (each may already be a dict/list on some responses).

Resolution
----------
ForecastEx exposes no settled/resolved field in this endpoint, so we never
stamp `resolution` here — closure is inferred elsewhere (Micah did the same
via a listing-absence sweep). We persist every contract the API returns.
"""

from __future__ import annotations

import json
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

VENUE = "forecastex"
SOURCE = "forecastex-rest"

CONTRACTS_PATH = "/api/contracts"


def _parse_dt(value: Any) -> datetime | None:
    """Parse ISO strings or epoch (s/ms) into tz-aware UTC datetimes."""
    if value is None or value == "":
        return None
    try:
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            # Heuristic: ms if it looks like a 13-digit epoch.
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


def _parse_contracts_payload(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Peel `body` → `data` (each possibly a JSON string) into a contract list."""
    if not data or not isinstance(data, dict):
        return []
    raw_body = data.get("body", {})
    if isinstance(raw_body, str):
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return []
    elif isinstance(raw_body, dict):
        body = raw_body
    else:
        return []
    if not isinstance(body, dict):
        return []
    contracts_str = body.get("data", "[]")
    if isinstance(contracts_str, str):
        try:
            contracts = json.loads(contracts_str)
        except json.JSONDecodeError:
            return []
    else:
        contracts = contracts_str if contracts_str else []
    if not isinstance(contracts, list):
        return []
    return [c for c in contracts if isinstance(c, dict)]


def _total_pages(data: dict[str, Any]) -> int:
    raw_body = data.get("body")
    body_meta = raw_body if isinstance(raw_body, dict) else {}
    try:
        return int(body_meta.get("total_pages", 1) or 1)
    except (TypeError, ValueError):
        return 1


async def _get_json(
    client: httpx.AsyncClient, params: dict[str, str]
) -> dict[str, Any]:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(CONTRACTS_PATH, params=params, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, dict) else {}
    return {}  # unreachable


async def _upsert_market(session: AsyncSession, c: dict[str, Any]) -> CoreMarket:
    contract_id = str(c.get("contract_id") or c.get("contractId") or "")
    if not contract_id:
        raise ValueError(f"forecastex contract missing contract_id: keys={list(c)[:6]}")
    external_id = contract_id

    product_id = str(c.get("product_id") or "")
    title = c.get("question") or c.get("event_display_name") or "(untitled)"
    url = (
        f"https://forecastex.com/markets/{product_id}/{contract_id}"
        if (product_id or contract_id)
        else None
    )
    raw = dict(c)
    if url:
        raw["url"] = url

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=external_id,
        title=str(title)[:1024],
        description=None,
        category=c.get("category"),
        tags=None,
        opens_at=None,
        closes_at=_parse_dt(c.get("expiration_date")),
        resolved_at=None,
        resolution=None,
        raw=raw,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "category": stmt.excluded.category,
            "closes_at": stmt.excluded.closes_at,
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
    session: AsyncSession, market: CoreMarket, c: dict[str, Any]
) -> bool:
    """Append a ts_price_snapshots row. ForecastEx reports `last_yes_price`
    (0..1 probability) and `open_interest` (slotted into volume_24h)."""
    last = _parse_float(c.get("last_yes_price"))
    volume = _parse_float(c.get("open_interest"))
    if last is None and volume is None:
        return False
    session.add(
        TsPriceSnapshot(
            market_id=market.id,
            snapshot_at=datetime.now(UTC),
            last_price=last,
            volume_24h=volume,
        )
    )
    return True


class ForecastExRestPoller:
    """Implements `pmi_ingest.pollers.Poller` for ForecastEx."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.forecastex_base_url
        self._page_size = ingest_settings.forecastex_page_size
        self._max_pages = ingest_settings.forecastex_max_pages

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        log.info("forecastex.poll_start", base_url=self._base_url)
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, follow_redirects=True
            ) as client:
                page_num = 1
                while page_num <= self._max_pages:
                    params = {
                        "page": str(page_num),
                        "pageSize": str(self._page_size),
                        "sortBy": "open_interest",
                        "sortOrder": "desc",
                    }
                    data = await _get_json(client, params)
                    contracts = _parse_contracts_payload(data)
                    if not contracts:
                        break

                    async with session_scope() as session:
                        for c in contracts:
                            try:
                                market = await _upsert_market(session, c)
                                await _write_price(session, market, c)
                                total += 1
                            except Exception as inner:
                                log.warning(
                                    "forecastex.market_skip",
                                    error=str(inner),
                                    contract_id=c.get("contract_id"),
                                )

                    if page_num >= _total_pages(data):
                        break
                    page_num += 1
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("forecastex.poll_failed", error=error_message)
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
            "forecastex.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
