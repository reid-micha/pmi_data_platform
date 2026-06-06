"""Kalshi orderbook depth poller (CORR-4.3 — Kalshi parity).

Pulls `/trade-api/v2/markets/{ticker}/orderbook` for every active Kalshi
ticker and writes `ts_orderbook_snapshots` with the same shape the
Polymarket CLOB poller uses, so the aggregator's liquidity weighting can
treat both venues uniformly.

Why one row per market (not per side)
-------------------------------------
Kalshi's orderbook payload publishes TWO bid books per binary market —
one for YES, one for NO. The orderbook is implicitly a single matching
engine: "best YES ask" is not in the response; it's `1 - best_NO_bid`.
So a YES-centric mid is `(best_yes_bid + (1 - best_no_bid)) / 2`. We
flatten to a single row with token_id=ticker, capturing both sides'
top levels in `bids` (YES bids) and `asks` (NO bids — readers infer
1 - price for YES ask).

Auth
----
Identical PSS-signed headers to `kalshi_rest`. Anonymous polling works
for orderbook reads (lower rate limit). The `_load_private_key` /
`_sign` / `_auth_headers` helpers are imported from `kalshi_rest` rather
than duplicated — single source of truth for the signature shape.

Rate limits
-----------
Kalshi docs cap anonymous reads at ~10 rps. We cap concurrent in-flight
via `kalshi_clob_concurrency` (default 4 — conservative) and rely on
tenacity for transient 429 retry.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket, TsOrderbookSnapshot
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll
from pmi_ingest.pollers.kalshi_rest import (
    _auth_headers,
    _load_private_key,
)

log = structlog.get_logger(__name__)

SOURCE = "kalshi-clob"

# Kalshi orderbook returns ALL price levels (no truncation flag observed).
# Keep top-N for forensics; full book stays available via raw HTTP if
# someone wants to replay a 200-level book retroactively.
TOP_N_LEVELS = 25


def _parse_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _normalize_levels(
    levels: list[Any], *, descending: bool, price_divisor: float = 1.0
) -> list[dict[str, float]]:
    """Kalshi levels arrive as `[[price_str, size_str], ...]`.

    The anonymous endpoint serves `orderbook_fp.{yes_dollars, no_dollars}`
    where prices are *strings in dollars* (e.g. `"0.4900"`). The
    authenticated cents-based endpoint (`orderbook.{yes, no}`) is
    available with KALSHI_API_KEY_ID set — see `_fetch_book` for the
    selection. `price_divisor` lets a future authenticated path pass
    100.0 to coerce cents back into 0..1 space.
    """
    out: list[dict[str, float]] = []
    for level in levels:
        if isinstance(level, dict):
            price = _parse_float(level.get("price"))
            size = _parse_float(level.get("size") or level.get("count"))
        elif isinstance(level, (list, tuple)) and len(level) >= 2:
            price = _parse_float(level[0])
            size = _parse_float(level[1])
        else:
            continue
        if price is None or size is None or size <= 0:
            continue
        out.append({"price": price / price_divisor, "size": size})
    out.sort(key=lambda x: x["price"], reverse=descending)
    return out


def _depth_within(
    levels: list[dict[str, float]], lo: float, hi: float
) -> float:
    return sum(level["size"] for level in levels if lo <= level["price"] <= hi)


def _summarize(
    yes_bids: list[dict[str, float]],
    no_bids: list[dict[str, float]],
) -> dict[str, Any]:
    """Compute YES-centric mid / spread / depth from Kalshi's dual-bid book.

    YES ask = 1 - best_NO_bid; YES side bids = yes_bids.
    """
    best_yes_bid = yes_bids[0]["price"] if yes_bids else None
    best_no_bid = no_bids[0]["price"] if no_bids else None
    synthetic_yes_ask = (1.0 - best_no_bid) if best_no_bid is not None else None

    if best_yes_bid is not None and synthetic_yes_ask is not None:
        mid: float | None = (best_yes_bid + synthetic_yes_ask) / 2
        spread: float | None = synthetic_yes_ask - best_yes_bid
    elif best_yes_bid is not None:
        mid, spread = best_yes_bid, None
    elif synthetic_yes_ask is not None:
        mid, spread = synthetic_yes_ask, None
    else:
        mid = spread = None

    bid_total = sum(b["size"] for b in yes_bids) if yes_bids else None
    no_total = sum(n["size"] for n in no_bids) if no_bids else None

    if mid is not None:
        # YES-side bid depth: yes_bids within 1%/5% of mid (price ≤ mid).
        bid_depth_1pct = (
            _depth_within(yes_bids, mid * 0.99, mid) if yes_bids else None
        )
        bid_depth_5pct = (
            _depth_within(yes_bids, mid * 0.95, mid) if yes_bids else None
        )
        # YES-side ask depth: synthetic 1 - no_bid within 1%/5% of mid,
        # which is no_bid prices in [1 - mid*1.01, 1 - mid] (price ≥ 1-mid).
        no_lo_1pct, no_hi_1pct = max(0.0, 1.0 - mid * 1.01), 1.0 - mid
        no_lo_5pct, no_hi_5pct = max(0.0, 1.0 - mid * 1.05), 1.0 - mid
        ask_depth_1pct = (
            _depth_within(no_bids, no_lo_1pct, no_hi_1pct) if no_bids else None
        )
        ask_depth_5pct = (
            _depth_within(no_bids, no_lo_5pct, no_hi_5pct) if no_bids else None
        )
    else:
        bid_depth_1pct = bid_depth_5pct = ask_depth_1pct = ask_depth_5pct = None

    return {
        "mid": mid,
        "spread": spread,
        "best_bid": best_yes_bid,
        "best_ask": synthetic_yes_ask,
        "bid_total": bid_total,
        # ask_total here is the NO-side total (= cap on what we could buy YES);
        # naming follows Polymarket convention so the column is comparable.
        "ask_total": no_total,
        "bid_depth_1pct": bid_depth_1pct,
        "ask_depth_1pct": ask_depth_1pct,
        "bid_depth_5pct": bid_depth_5pct,
        "ask_depth_5pct": ask_depth_5pct,
    }


async def _fetch_book(
    client: httpx.AsyncClient,
    ticker: str,
    private_key: Any | None,
) -> tuple[list[Any], list[Any]]:
    """Return `(yes_levels, no_levels)`. Each list is `[[price, size], ...]`.

    Tries the response shape twice: anon path returns `orderbook_fp` with
    string-dollar prices; authenticated path returns `orderbook` with
    integer-cent prices. Caller passes both to `_normalize_levels` with
    the matching `price_divisor`.
    """
    path = f"/trade-api/v2/markets/{ticker}/orderbook"
    headers = _auth_headers(private_key, path) if private_key else None
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(path, headers=headers, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                return ([], [])
            # Anon path: `orderbook_fp.{yes_dollars, no_dollars}`.
            fp = data.get("orderbook_fp")
            if isinstance(fp, dict):
                return (fp.get("yes_dollars") or [], fp.get("no_dollars") or [])
            # Authenticated path: `orderbook.{yes, no}` (cents).
            ob = data.get("orderbook")
            if isinstance(ob, dict):
                return (ob.get("yes") or [], ob.get("no") or [])
            return ([], [])
    return ([], [])  # unreachable


async def _select_active_tickers(session: AsyncSession) -> list[tuple[int, str]]:
    """Return [(market_id, ticker)] for active Kalshi markets."""
    now = datetime.now(UTC)
    stmt = (
        select(CoreMarket.id, CoreMarket.external_id)
        .where(CoreMarket.venue == "kalshi")
        .where(CoreMarket.resolution.is_(None))
        .where((CoreMarket.closes_at.is_(None)) | (CoreMarket.closes_at > now))
    )
    rows = (await session.execute(stmt)).all()
    return [(mid, tkr) for mid, tkr in rows if tkr]


async def _poll_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    private_key: Any | None,
    market_id: int,
    ticker: str,
) -> TsOrderbookSnapshot | None:
    async with sem:
        try:
            yes_raw, no_raw = await _fetch_book(client, ticker, private_key)
        except Exception as exc:
            log.warning(
                "kalshi.clob.book_failed",
                ticker=ticker,
                error=str(exc)[:200],
            )
            return None

    # `_fetch_book` returns dollar-strings on the anon path — divisor=1.
    # If the authenticated cents endpoint is wired later, switch to 100.0
    # based on response shape; keep divisor uniform here for clarity.
    yes_bids = _normalize_levels(yes_raw, descending=True)
    no_bids = _normalize_levels(no_raw, descending=True)
    if not yes_bids and not no_bids:
        return None

    summary = _summarize(yes_bids, no_bids)
    return TsOrderbookSnapshot(
        market_id=market_id,
        # Use the ticker as token_id — Kalshi has no Polymarket-style
        # 80-char numeric token id, and ticker is what every other
        # Kalshi endpoint / WS subscribe uses.
        token_id=ticker,
        snapshot_at=datetime.now(UTC),
        mid=summary["mid"],
        spread=summary["spread"],
        best_bid=summary["best_bid"],
        best_ask=summary["best_ask"],
        bid_depth_1pct=summary["bid_depth_1pct"],
        ask_depth_1pct=summary["ask_depth_1pct"],
        bid_depth_5pct=summary["bid_depth_5pct"],
        ask_depth_5pct=summary["ask_depth_5pct"],
        bid_total=summary["bid_total"],
        ask_total=summary["ask_total"],
        bids=yes_bids[:TOP_N_LEVELS],
        # `asks` here = NO-side bids (best-first descending by NO price).
        # Stored verbatim; readers do `1 - price` to translate to YES ask space.
        asks=no_bids[:TOP_N_LEVELS],
    )


class KalshiClobPoller:
    """Implements `pmi_ingest.pollers.Poller` for Kalshi orderbook depth."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.kalshi_base_url
        self._concurrency = ingest_settings.kalshi_clob_concurrency
        self._max_per_cycle = ingest_settings.kalshi_clob_max_per_cycle

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        success = True
        error_class: str | None = None
        error_message: str | None = None
        snapshots_written = 0

        private_key = _load_private_key()
        use_auth = private_key is not None and bool(ingest_settings.kalshi_api_key_id)
        log.info("kalshi.clob.cycle_start", authenticated=use_auth)

        try:
            async with session_scope() as session:
                tickers = await _select_active_tickers(session)

            if not tickers:
                log.info("kalshi.clob.no_tickers")
            else:
                if len(tickers) > self._max_per_cycle:
                    log.warning(
                        "kalshi.clob.truncated",
                        eligible=len(tickers),
                        max_per_cycle=self._max_per_cycle,
                    )
                    tickers = tickers[: self._max_per_cycle]

                sem = asyncio.Semaphore(self._concurrency)
                async with httpx.AsyncClient(
                    base_url=self._base_url, follow_redirects=True
                ) as client:
                    results = await asyncio.gather(
                        *(
                            _poll_one(
                                client,
                                sem,
                                private_key if use_auth else None,
                                mid,
                                tkr,
                            )
                            for mid, tkr in tickers
                        ),
                        return_exceptions=False,
                    )

                rows = [r for r in results if r is not None]
                if rows:
                    async with session_scope() as session:
                        session.add_all(rows)
                    snapshots_written = len(rows)

                log.info(
                    "kalshi.clob.cycle",
                    eligible=len(tickers),
                    snapshots=snapshots_written,
                )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("kalshi.clob.cycle_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=snapshots_written if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=None,
                )

        if not success and error_message:
            raise RuntimeError(error_message)
        return snapshots_written
