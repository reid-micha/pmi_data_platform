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


def _parse_clob_tokens(value: Any) -> tuple[str | None, str | None]:
    """Pull (yes_token, no_token) out of Polymarket Gamma `clobTokenIds`.

    Gamma serializes this as a JSON-stringified array, e.g.
    `'["123456...", "789012..."]'`. Position [0] is YES, [1] is NO.
    Some endpoints return it pre-parsed as a list — handle both.
    """
    import json

    if value is None:
        return (None, None)
    if isinstance(value, str):
        if not value.strip():
            return (None, None)
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return (None, None)
    if not isinstance(value, list):
        return (None, None)
    yes = str(value[0]) if len(value) >= 1 and value[0] else None
    no = str(value[1]) if len(value) >= 2 and value[1] else None
    return (yes, no)


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
    path: str = "/markets/keyset",
    items_key: str = "markets",
) -> tuple[list[dict[str, Any]], str | None]:
    """Fetch one keyset page. Returns `(items, next_cursor)`.

    `items_key` is the field in the response body that wraps the list
    (``markets`` on /markets/keyset, ``events`` on /events/keyset — both
    follow the same Gamma keyset convention).

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
            resp = await client.get(path, params=params, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                items = data.get(items_key) or []
                next_cursor = data.get("next_cursor") or None
                if isinstance(items, list):
                    return items, next_cursor
            # Defensive fallback — older / changed shapes
            if isinstance(data, list):
                return data, None
            return [], None
    return [], None  # unreachable


# Polymarket uses several editorial tags that aren't topical categories —
# "Featured" promotes a market on the front page, "Hide From New" hides it.
# Mirror Micah's "Featured" skip and extend with the other internal flags
# observed live (2026-06-03 sample: "Hide From New" appearing as the only
# tag on ~3% of events). Falling through to the next tag preserves the
# real topical label ("Crypto Prices", "Politics", etc.).
_SKIP_TAG_LABELS = frozenset({"Featured", "Hide From New"})


async def _fetch_event_categories(
    client: httpx.AsyncClient, page_size: int, max_pages: int
) -> dict[str, str]:
    """Walk ``/events/keyset`` once and return ``{market_external_id: category}``.

    Backport of Micah PR #319 / job-executor PR #9's ``_fetch_event_metadata``.
    The Gamma ``/markets/keyset`` payload doesn't surface the event's
    editorial category — that lives on the parent event under ``tags[].label``.
    Walking events alongside markets lets us populate ``core_markets.category``
    from the topical event tag (e.g. "Politics", "Economy") instead of falling
    back to ``m.get("category")`` which is usually null on Polymarket markets.

    The first tag whose label is not "Featured" wins, matching Micah's
    behaviour exactly. Events without a usable tag are skipped — their
    child markets keep whatever ``m.get("category")`` provides.

    Failure (HTTP 4xx/5xx, network, parse) returns ``{}`` so the caller
    degrades to the pre-backport behaviour rather than failing the whole
    market poll cycle.
    """
    out: dict[str, str] = {}
    try:
        cursor: str | None = None
        page = 0
        while page < max_pages:
            batch, next_cursor = await _fetch_keyset_page(
                client, cursor, page_size,
                path="/events/keyset", items_key="events",
            )
            if not batch:
                break
            for evt in batch:
                tags = evt.get("tags") or []
                category: str | None = None
                for tag in tags:
                    label = tag.get("label") if isinstance(tag, dict) else None
                    if not label or label in _SKIP_TAG_LABELS:
                        continue
                    category = str(label)
                    break
                if not category:
                    continue
                for mkt in evt.get("markets") or []:
                    mkt_id = mkt.get("id") if isinstance(mkt, dict) else None
                    if mkt_id is not None:
                        out[str(mkt_id)] = category
            if not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor
            page += 1
    except Exception as exc:
        # Non-fatal: degrade gracefully so a flaky /events endpoint can't
        # take out the (much more critical) /markets ingest.
        log.warning(
            "polymarket.events_enrich_failed",
            error=str(exc)[:256],
            collected=len(out),
        )
    return out


async def _upsert_market(
    session: AsyncSession,
    m: dict[str, Any],
    event_categories: dict[str, str] | None = None,
) -> CoreMarket:
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
    # Prefer the event-level category we collected from /events/keyset (Micah
    # backport — PR #319 enrichment), since /markets/keyset itself rarely
    # populates a usable `category` field. Fall back to whatever the market
    # row carries so existing callers and mock fixtures still work.
    category = (
        (event_categories or {}).get(external_id)
        or m.get("category")
        or m.get("group")
    )
    tags = _ilike_terms(m) or None
    opens_at = _parse_dt(m.get("startDate") or m.get("createdAt"))
    closes_at = _parse_dt(m.get("endDate") or m.get("closedTime"))
    resolved_at = _parse_dt(m.get("resolvedAt"))
    resolution: str | None = None
    if m.get("resolved"):
        resolution = (m.get("resolution") or m.get("outcome") or "RESOLVED").upper()[:32]

    condition_id = m.get("conditionId") or None
    clob_yes_token, clob_no_token = _parse_clob_tokens(m.get("clobTokenIds"))

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
        condition_id=condition_id,
        clob_yes_token=clob_yes_token,
        clob_no_token=clob_no_token,
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
            "condition_id": stmt.excluded.condition_id,
            "clob_yes_token": stmt.excluded.clob_yes_token,
            "clob_no_token": stmt.excluded.clob_no_token,
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
                # Pre-fetch event categories from /events/keyset so we can
                # populate core_markets.category from the parent event's
                # topical tag (Micah PR #319 backport). Failures are swallowed
                # inside the helper — degrades to per-market `category` only.
                event_categories = await _fetch_event_categories(
                    client, self._page_size, self._max_pages
                )
                if event_categories:
                    log.info(
                        "polymarket.events_enrich_ready",
                        markets_with_category=len(event_categories),
                    )

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
                                market = await _upsert_market(
                                    session, m, event_categories
                                )
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
