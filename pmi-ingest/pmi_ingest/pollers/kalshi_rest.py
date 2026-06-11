"""Kalshi Elections REST poller.

Ported from `micah-job-executor/app/sources/kalshi.py` (2026-06-01). Shares the
shape of [`polymarket_rest.py`](./polymarket_rest.py): async httpx + tenacity
retries + `ON CONFLICT DO UPDATE` upserts on `(venue, external_id)` +
`record_poll` audit row per cycle.

Auth (optional)
---------------
Kalshi's Elections API serves most public market data unauthenticated, but
rate limits are higher with API-key-signed requests. If both
`KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY` are set, every request is signed
with RSA-PSS over `{timestamp_ms}{METHOD}{path}` and a fresh timestamp per
page (signatures expire within seconds — reusing one across pagination 403s).
Missing either env var → unauthenticated fallback, logged once at startup.

Why fetch /events first
-----------------------
The /markets payload carries an `event_ticker` but no category or series
ticker. The events endpoint maps event_ticker → (category, series_ticker),
which we need to (a) populate `core_markets.category` and (b) build the
canonical kalshi.com market URL. Multivariate / parlay markets use synthetic
event tickers absent from /events; we fall back to the first
`mve_selected_legs[].event_ticker` whose series ticker we know.
"""

from __future__ import annotations

import asyncio
import base64
import time
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

VENUE = "kalshi"
SOURCE = "kalshi-rest"

MARKETS_PATH = "/trade-api/v2/markets"
EVENTS_PATH = "/trade-api/v2/events"


# ─── auth ──────────────────────────────────────────────────────────────────

def _load_private_key() -> Any | None:
    """Load RSA private key from settings; return None if not configured.

    Accepts three shapes:
    1. Inline PEM with real newlines (`-----BEGIN ...\n MII... \n-----END...`).
    2. Inline PEM with literal `\\n` escapes (Render-style env vars).
    3. A filesystem path. The file itself may also be saved in the
       escaped-newline shape (when an operator copy-pasted from the Render
       UI verbatim); we apply the same un-escape after read.
    """
    key_data = ingest_settings.kalshi_private_key
    if not key_data:
        return None
    from cryptography.hazmat.primitives import serialization

    key_data = key_data.replace("\\n", "\n")
    if key_data.startswith("-----"):
        pem_bytes = key_data.encode()
    else:
        with open(key_data, "rb") as f:
            raw = f.read()
        # Same un-escape — a file written by copy-paste from a Render env
        # var has literal `\n` text between header / payload / footer.
        text = raw.decode("utf-8", errors="replace")
        if "\\n" in text and "\n" not in text.strip():
            text = text.replace("\\n", "\n")
        pem_bytes = text.encode()
    return serialization.load_pem_private_key(pem_bytes, password=None)


def _sign(private_key: Any, ts_ms: str, method: str, path: str) -> str:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    msg = f"{ts_ms}{method}{path}".encode()
    sig = private_key.sign(
        msg,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(sig).decode()


def _auth_headers(private_key: Any, path: str) -> dict[str, str]:
    ts_ms = str(int(time.time() * 1000))
    return {
        "KALSHI-ACCESS-KEY": ingest_settings.kalshi_api_key_id or "",
        "KALSHI-ACCESS-TIMESTAMP": ts_ms,
        "KALSHI-ACCESS-SIGNATURE": _sign(private_key, ts_ms, "GET", path),
    }


# ─── parsing helpers ───────────────────────────────────────────────────────

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


def _build_url(
    event_ticker: str,
    series_tickers: dict[str, str],
    mve_legs: list[dict[str, Any]],
) -> str | None:
    """Build `https://kalshi.com/markets/{series}/{event_ticker}` (lowercase).

    Falls back to first parlay-leg's series, or event_ticker-only URL (Kalshi
    redirects that to the slug form).
    """
    if not event_ticker:
        return None
    series = series_tickers.get(event_ticker, "")
    if not series:
        for leg in mve_legs:
            leg_et = leg.get("event_ticker", "")
            if leg_et and series_tickers.get(leg_et):
                series = series_tickers[leg_et]
                break
    if series:
        return f"https://kalshi.com/markets/{series.lower()}/{event_ticker.lower()}"
    return f"https://kalshi.com/markets/{event_ticker.lower()}"


def _title(market: dict[str, Any]) -> str:
    title = str(market.get("title") or "(untitled)")
    yes_sub = market.get("yes_sub_title") or ""
    if yes_sub and yes_sub.lower() not in title.lower():
        title = f"{title} - {yes_sub}"
    return title


def _is_resolved(status: str) -> tuple[bool, str | None]:
    """Kalshi statuses past 'active'/'initialized' mean outcome decided.

    Returns `(resolved, resolution_label)`. `resolution_label` is the
    uppercased status string truncated to 32 chars; we don't know YES/NO
    without per-market detail call, so the status itself is the best signal.
    """
    s = status.lower()
    if not s or s in ("active", "initialized"):
        return False, None
    return True, s.upper()[:32]


# ─── HTTP ──────────────────────────────────────────────────────────────────

async def _get_json(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, str],
    headers: dict[str, str] | None,
) -> dict[str, Any]:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(6),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(path, params=params, headers=headers, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, dict) else {}
    return {}  # unreachable


async def _fetch_event_meta(
    client: httpx.AsyncClient,
    private_key: Any | None,
) -> tuple[dict[str, str], dict[str, str]]:
    """Walk /events; return `(event_ticker→category, event_ticker→series)`."""
    categories: dict[str, str] = {}
    series: dict[str, str] = {}
    cursor: str | None = None
    pages = 0
    while pages < ingest_settings.kalshi_max_pages:
        params: dict[str, str] = {"limit": "200"}
        if cursor:
            params["cursor"] = cursor
        headers = _auth_headers(private_key, EVENTS_PATH) if private_key else None
        data = await _get_json(client, EVENTS_PATH, params, headers)
        events = data.get("events") or []
        if not events:
            break
        for evt in events:
            et = evt.get("event_ticker", "")
            if not et:
                continue
            if evt.get("category"):
                categories[et] = evt["category"]
            if evt.get("series_ticker"):
                series[et] = evt["series_ticker"]
        cursor = data.get("cursor") or None
        pages += 1
        if not cursor:
            break
        if ingest_settings.kalshi_page_delay_sec:
            await asyncio.sleep(ingest_settings.kalshi_page_delay_sec)
    log.info("kalshi.event_meta_loaded", categories=len(categories), series=len(series))
    return categories, series


# ─── DB writes ─────────────────────────────────────────────────────────────

async def _upsert_market(
    session: AsyncSession,
    m: dict[str, Any],
    categories: dict[str, str],
    series_tickers: dict[str, str],
) -> CoreMarket:
    ticker = str(m.get("ticker") or "")
    if not ticker:
        raise ValueError(f"kalshi market missing ticker: keys={list(m)[:6]}")

    event_ticker = m.get("event_ticker") or ""
    mve_legs = m.get("mve_selected_legs") or []

    category: str | None = categories.get(event_ticker)
    if category is None:
        for leg in mve_legs:
            leg_et = leg.get("event_ticker", "")
            if leg_et and leg_et in categories:
                category = categories[leg_et]
                break

    status = (m.get("status") or "").lower()
    resolved, resolution = _is_resolved(status)

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=ticker,
        slug=ticker.lower(),
        title=_title(m),
        description=m.get("rules_primary") or m.get("subtitle"),
        category=category,
        tags=[event_ticker] if event_ticker else None,
        opens_at=_parse_dt(m.get("open_time")),
        closes_at=_parse_dt(m.get("close_time")),
        resolved_at=_parse_dt(m.get("expiration_time")) if resolved else None,
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

    stub = CoreMarket()
    stub.id = market_id
    stub.venue = VENUE
    stub.external_id = ticker
    # URL is derived from event/series meta; store on raw for now since
    # CoreMarket has no url column — selectors can pull from `raw->>'url'`
    # if needed.
    m["url"] = _build_url(event_ticker, series_tickers, mve_legs)
    return stub


async def _write_price(session: AsyncSession, market: CoreMarket, m: dict[str, Any]) -> bool:
    """Append a `ts_price_snapshots` row from Kalshi market fields.

    Kalshi reports `last_price_dollars` (0–1 probability), `yes_bid` / `yes_ask`
    in cents, and cumulative `volume_fp` (not 24h — Kalshi has no rolling
    24h field in /markets; we slot it anyway because `volume_24h` is the
    closest column and a poller-derived 24h delta is future work).
    """
    last = _parse_float(m.get("last_price_dollars"))
    bid_cents = _parse_float(m.get("yes_bid"))
    ask_cents = _parse_float(m.get("yes_ask"))
    bid = bid_cents / 100.0 if bid_cents is not None else None
    ask = ask_cents / 100.0 if ask_cents is not None else None
    volume = _parse_float(m.get("volume_fp") or m.get("volume"))
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


# ─── poller ────────────────────────────────────────────────────────────────

class KalshiRestPoller:
    """Implements `pmi_ingest.pollers.Poller`."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.kalshi_base_url
        self._page_size = ingest_settings.kalshi_page_size
        self._max_pages = ingest_settings.kalshi_max_pages

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        private_key = _load_private_key()
        use_auth = private_key is not None and bool(ingest_settings.kalshi_api_key_id)
        log.info("kalshi.poll_start", authenticated=use_auth, base_url=self._base_url)

        try:
            async with httpx.AsyncClient(base_url=self._base_url, follow_redirects=True) as client:
                categories, series_tickers = await _fetch_event_meta(
                    client, private_key if use_auth else None
                )

                cursor: str | None = None
                page = 0
                while page < self._max_pages:
                    params: dict[str, str] = {
                        "limit": str(self._page_size),
                        "status": "open",
                        "mve_filter": "exclude",
                    }
                    if cursor:
                        params["cursor"] = cursor
                    headers = _auth_headers(private_key, MARKETS_PATH) if use_auth else None
                    data = await _get_json(client, MARKETS_PATH, params, headers)
                    markets = data.get("markets") or []
                    if not markets:
                        break

                    async with session_scope() as session:
                        for m in markets:
                            try:
                                market = await _upsert_market(session, m, categories, series_tickers)
                                await _write_price(session, market, m)
                                total += 1
                            except Exception as inner:
                                log.warning(
                                    "kalshi.market_skip",
                                    error=str(inner),
                                    ticker=m.get("ticker"),
                                )

                    next_cursor = data.get("cursor") or None
                    if not next_cursor or next_cursor == cursor:
                        break
                    cursor = next_cursor
                    page += 1
                    if ingest_settings.kalshi_page_delay_sec:
                        await asyncio.sleep(ingest_settings.kalshi_page_delay_sec)
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("kalshi.poll_failed", error=error_message)
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
                    expected_records_24h=24 * 12 * self._page_size,
                )

        log.info(
            "kalshi.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
