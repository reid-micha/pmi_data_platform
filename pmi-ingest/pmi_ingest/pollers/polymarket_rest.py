"""Polymarket Gamma REST poller.

Single source of truth at P0. Walks `/markets/keyset?active=true&closed=false`
with `after_cursor` pagination, UPSERTs `core_markets`, appends
`ts_price_snapshots`, and records an `audit_source_health` row on every cycle.

Why keyset and not /markets?offset (CORR-3.9)
---------------------------------------------
Polymarket's Gamma API exposes both styles on /markets, but the offset variant
caps at offset≤10,000 (HTTP 422 above) — a server-wide ceiling that applies
regardless of filters. Empirically the gap between `ascending=false` top-10k
and `ascending=true` bottom-10k contains ~342k market IDs we'd otherwise miss
(spot-check 2026-05-30: live ingest stopped at id≥2375199 desc / id≤2032546 asc).

The keyset endpoint uses an opaque `next_cursor` returned in the body and a
matching `after_cursor` query param. Cursor param name was discovered via
`/openapi.json` (documented for the sibling /spotlights/keyset; /markets/keyset
follows the same convention). It has no offset cap and is stable under writes —
new markets landing mid-poll don't shift our cursor position the way offset
would. UPSERT idempotency (CORR-3.1) still matters in case the same id appears
across boundary pages.

ToS reminder: §13 open question — commercial redistribution. Until resolved, treat
this as internal use only.
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

VENUE = "polymarket"
SOURCE = "polymarket-rest"


def _parse_dt(value: Any) -> datetime | None:
    if not value:
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


def _ilike_terms(market: dict[str, Any]) -> list[str]:
    """Flatten Polymarket tags into a stringified list for `core_markets.tags`."""
    tags = market.get("tags") or []
    out: list[str] = []
    for t in tags:
        if isinstance(t, dict):
            label = t.get("label") or t.get("slug")
            if label:
                out.append(str(label))
        elif isinstance(t, str):
            out.append(t)
    return out


async def _fetch_keyset_page(
    client: httpx.AsyncClient,
    after_cursor: str | None,
    limit: int,
) -> tuple[list[dict[str, Any]], str | None]:
    """Fetch one keyset page. Returns `(markets, next_cursor)`.

    `next_cursor` is None when the API signals end-of-dataset (missing key or
    empty string in the response). Callers treat that as the natural break.

    Retries transient HTTP / network errors via tenacity. HTTP 4xx other than
    the cursor case is non-retryable and surfaces as `httpx.HTTPStatusError`,
    which the poll loop catches at the outer `try` and reports as cycle failure.
    """
    params: dict[str, str] = {
        "active": "true",
        "closed": "false",
        "limit": str(limit),
        "order": "createdAt",
        "ascending": "false",
    }
    if after_cursor:
        params["after_cursor"] = after_cursor

    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get("/markets/keyset", params=params, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                markets = data.get("markets") or []
                next_cursor = data.get("next_cursor") or None
                if isinstance(markets, list):
                    return markets, next_cursor
            # Defensive fallback — older / changed shapes
            if isinstance(data, list):
                return data, None
            return [], None
    return [], None  # unreachable


async def _upsert_market(session: AsyncSession, m: dict[str, Any]) -> CoreMarket:
    """Atomic upsert on `(venue, external_id)`.

    Why ON CONFLICT and not SELECT-then-INSERT
    -----------------------------------------
    Polymarket's `order=createdAt&ascending=false` pagination is fundamentally
    unstable — when new markets land mid-poll, the SAME `external_id` can
    surface on two adjacent pages within one cycle. The old SELECT-then-INSERT
    pattern then raced itself (no row visible from page 1 yet, two INSERTs
    queued, second one trips `UniqueViolation`, session rolls back, the rest
    of the page's batch cascades into `polymarket.market_skip` warnings).
    Mock fixture (13 markets) never reproduced this; live ingest (10k+) hits
    it every cycle. Switching to `INSERT … ON CONFLICT DO UPDATE` makes the
    write order-independent and removes the race entirely (CORR-3.1).
    """
    external_id = str(m.get("id") or m.get("conditionId") or m.get("slug"))
    if not external_id or external_id == "None":
        raise ValueError(f"market missing external_id: keys={list(m)[:8]}")

    title = str(m.get("question") or m.get("title") or m.get("slug") or "(untitled)")
    category = m.get("category") or m.get("group")
    tags = _ilike_terms(m) or None
    opens_at = _parse_dt(m.get("startDate") or m.get("createdAt"))
    closes_at = _parse_dt(m.get("endDate") or m.get("closedTime"))
    resolved_at = _parse_dt(m.get("resolvedAt"))
    resolution: str | None = None
    if m.get("resolved"):
        resolution = (m.get("resolution") or m.get("outcome") or "RESOLVED").upper()[:32]

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=m.get("slug"),
        title=title,
        description=m.get("description"),
        category=category,
        tags=tags,
        opens_at=opens_at,
        closes_at=closes_at,
        resolved_at=resolved_at,
        resolution=resolution,
        raw=m,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "description": stmt.excluded.description,
            "category": stmt.excluded.category,
            "tags": stmt.excluded.tags,
            "opens_at": stmt.excluded.opens_at,
            "closes_at": stmt.excluded.closes_at,
            "resolved_at": stmt.excluded.resolved_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)

    market_id = (await session.execute(stmt)).scalar_one()

    # We don't need a full ORM instance for the caller's purposes — only the
    # PK to attach a ts_price_snapshot row. Build a detached stub that exposes
    # `id` without round-tripping a SELECT (saves 10k queries/cycle at scale).
    stub = CoreMarket()
    stub.id = market_id
    stub.venue = VENUE
    stub.external_id = external_id
    stub.title = title
    return stub


async def _write_price(session: AsyncSession, market: CoreMarket, m: dict[str, Any]) -> bool:
    """Append a `ts_price_snapshots` row if price data present."""
    last = _parse_float(m.get("lastTradePrice") or m.get("lastPrice"))
    bid = _parse_float(m.get("bestBid"))
    ask = _parse_float(m.get("bestAsk"))
    volume = _parse_float(m.get("volume") or m.get("volume24Hr"))
    liquidity = _parse_float(m.get("liquidity"))

    if all(v is None for v in (last, bid, ask, volume, liquidity)):
        return False

    session.add(
        TsPriceSnapshot(
            market_id=market.id,
            snapshot_at=datetime.now(UTC),
            last_price=last,
            bid=bid,
            ask=ask,
            volume_24h=volume,
            liquidity=liquidity,
        )
    )
    return True


class PolymarketRestPoller:
    """Implements `pmi_ingest.pollers.Poller`."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.polymarket_base_url
        self._page_size = ingest_settings.polymarket_page_size
        self._max_pages = ingest_settings.polymarket_max_pages

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total_markets = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        try:
            async with httpx.AsyncClient(base_url=self._base_url, follow_redirects=True) as client:
                # Walk /markets/keyset using `after_cursor`. The normal exit is
                # `next_cursor` going None (or an empty page). `polymarket_max_pages`
                # is a safety ceiling against runaway loops if the API ever stops
                # advancing the cursor; the `next_cursor == cursor` check below
                # catches that fixpoint loop on the very next request.
                page = 0
                cursor: str | None = None
                while True:
                    if page >= self._max_pages:
                        log.warning(
                            "polymarket.max_pages_hit",
                            page=page,
                            page_size=self._page_size,
                            markets_collected=total_markets,
                            message=(
                                "Safety ceiling reached; bump polymarket_max_pages "
                                "if the live universe genuinely exceeded "
                                f"{self._max_pages * self._page_size} rows."
                            ),
                        )
                        break
                    batch, next_cursor = await _fetch_keyset_page(
                        client, cursor, self._page_size
                    )
                    if not batch:
                        break
                    async with session_scope() as session:
                        for m in batch:
                            try:
                                market = await _upsert_market(session, m)
                                await _write_price(session, market, m)
                                total_markets += 1
                            except Exception as inner:
                                log.warning(
                                    "polymarket.market_skip",
                                    error=str(inner),
                                    keys=list(m)[:6],
                                )
                    # End-of-dataset: server stopped issuing a continuation token.
                    if not next_cursor:
                        break
                    # Fixpoint guard: if the server echoes back the cursor we
                    # just sent (cursor==next_cursor) we'd loop forever. ON
                    # CONFLICT UPSERT means rows aren't duplicated, but the
                    # audit cycle would burn until max_pages_hit. Exit cleanly.
                    if next_cursor == cursor:
                        log.warning(
                            "polymarket.cursor_stuck",
                            page=page,
                            markets_collected=total_markets,
                            cursor_prefix=next_cursor[:32],
                        )
                        break
                    cursor = next_cursor
                    page += 1
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("polymarket.poll_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=total_markets if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=24 * 12 * self._page_size,  # heuristic
                )

        log.info(
            "polymarket.poll_done",
            success=success,
            records=total_markets,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total_markets
