"""Polymarket /prices-history backfill poller (CORR-3.10 / SHIP-4.5).

Pulls historical price points from `clob.polymarket.com/prices-history` for
every active YES token and inserts them into `ts_price_snapshots`. Unlocks
the SHIP-3.4 backtest CLI — without this, backtests can only replay forward
from the moment polymarket_rest started polling.

Endpoint shape
--------------
    GET /prices-history?market=<token_id>&interval=<i>[&fidelity=<min>]

Returns `{"history": [{"t": <unix_seconds>, "p": <price 0..1>}]}`.

Documented `interval` values: `1h | 6h | 1d | 1w | 1m | max`. Each call
returns ~200 evenly-spaced points across the requested span. For a full
backfill we typically want `interval=1d` (full lifetime, daily granularity)
plus a higher-fidelity recent slice (`interval=1w` for finer-grained
backtest of the last week if desired).

Idempotency
-----------
Relies on alembic 0005's `(market_id, snapshot_at)` unique constraint —
`ON CONFLICT DO NOTHING` makes re-runs free. Two backfill modes returning
the same Unix-second timestamp collapse cleanly.

Rate limits
-----------
CLOB read endpoints are unauthenticated but we keep concurrency low
(default 8) and per-cycle cap conservative (1000 markets per invocation)
so a full-universe backfill spans several cron beats rather than burning
the rate limit in one shot. The poller is intentionally one-shot — re-run
periodically to fill new markets that appeared since the last sweep.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from sqlalchemy import select
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

SOURCE = "polymarket-history"

# Polymarket CLOB recognises these `interval=` enum values. `max` spans the
# market's whole life (best for one-shot backfill); the rest narrow the
# window for finer fidelity at the cost of older history.
_VALID_INTERVALS = {"1h", "6h", "1d", "1w", "1m", "max"}


def _parse_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _fetch_history(
    client: httpx.AsyncClient, token_id: str, interval: str, fidelity: int | None
) -> list[dict[str, Any]]:
    params: dict[str, str] = {"market": token_id, "interval": interval}
    if fidelity is not None:
        # Per Polymarket: `fidelity` is minutes-per-bar, only honoured for
        # finer-than-default intervals. Safe to pass through.
        params["fidelity"] = str(fidelity)
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get("/prices-history", params=params, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                history = data.get("history") or []
                if isinstance(history, list):
                    return history
            return []
    return []  # unreachable


async def _select_active_tokens(session: AsyncSession) -> list[tuple[int, str]]:
    """Markets to backfill: Polymarket, active, has CLOB YES token populated."""
    now = datetime.now(UTC)
    stmt = (
        select(CoreMarket.id, CoreMarket.clob_yes_token)
        .where(CoreMarket.venue == "polymarket")
        .where(CoreMarket.clob_yes_token.is_not(None))
        .where(CoreMarket.resolution.is_(None))
        .where((CoreMarket.closes_at.is_(None)) | (CoreMarket.closes_at > now))
    )
    rows = (await session.execute(stmt)).all()
    return [(mid, tid) for mid, tid in rows if tid]


async def _backfill_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    market_id: int,
    token_id: str,
    interval: str,
    fidelity: int | None,
) -> list[dict[str, Any]]:
    """Pull history → list of insert-spec dicts. None side-channels via empty list."""
    async with sem:
        try:
            history = await _fetch_history(client, token_id, interval, fidelity)
        except Exception as exc:
            log.warning(
                "polymarket.history.fetch_failed",
                token_id=token_id,
                error=str(exc)[:200],
            )
            return []

    rows: list[dict[str, Any]] = []
    for point in history:
        if not isinstance(point, dict):
            continue
        t = point.get("t")
        p = _parse_float(point.get("p"))
        if t is None or p is None:
            continue
        try:
            ts = datetime.fromtimestamp(float(t), tz=UTC)
        except (TypeError, ValueError, OSError):
            continue
        rows.append(
            {
                "market_id": market_id,
                "snapshot_at": ts,
                "last_price": p,
            }
        )
    return rows


async def _bulk_insert(session: AsyncSession, rows: list[dict[str, Any]]) -> int:
    """Idempotent batch insert. Returns count of rows actually written."""
    if not rows:
        return 0
    stmt = pg_insert(TsPriceSnapshot).values(rows)
    stmt = stmt.on_conflict_do_nothing(
        constraint="uq_ts_price_snapshots__market_time"
    )
    result = await session.execute(stmt)
    # rowcount = number of rows the INSERT actually appended (conflicts skip).
    return int(result.rowcount or 0)


class PolymarketHistoryPoller:
    """One-shot historical backfill poller.

    Intended cron cadence: daily (e.g. 02:00 UTC), so that markets created
    in the last 24h get their history pulled in once they have data. Live
    forward-write continues via `polymarket_rest` and `polymarket_ws`.
    """

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.polymarket_clob_base_url
        self._concurrency = ingest_settings.polymarket_history_concurrency
        self._max_per_cycle = ingest_settings.polymarket_history_max_per_cycle
        interval = ingest_settings.polymarket_history_interval
        self._interval = interval if interval in _VALID_INTERVALS else "max"
        # 0 / None → omit the fidelity param entirely (let server pick).
        fid = ingest_settings.polymarket_history_fidelity_min
        self._fidelity = fid if fid > 0 else None

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        success = True
        error_class: str | None = None
        error_message: str | None = None
        rows_written = 0

        try:
            async with session_scope() as session:
                tokens = await _select_active_tokens(session)

            if not tokens:
                log.info("polymarket.history.no_tokens")
            else:
                if len(tokens) > self._max_per_cycle:
                    log.warning(
                        "polymarket.history.truncated",
                        eligible=len(tokens),
                        max_per_cycle=self._max_per_cycle,
                    )
                    tokens = tokens[: self._max_per_cycle]

                sem = asyncio.Semaphore(self._concurrency)
                async with httpx.AsyncClient(
                    base_url=self._base_url, follow_redirects=True
                ) as client:
                    batches = await asyncio.gather(
                        *(
                            _backfill_one(
                                client,
                                sem,
                                mid,
                                tid,
                                self._interval,
                                self._fidelity,
                            )
                            for mid, tid in tokens
                        ),
                        return_exceptions=False,
                    )

                flat: list[dict[str, Any]] = [r for batch in batches for r in batch]
                if flat:
                    # Chunk inserts to keep statement size sane — pg has a
                    # ~65k parameter cap on a single statement; with 3 cols
                    # that's ~21k rows max. 5k is comfortable.
                    chunk_size = 5000
                    async with session_scope() as session:
                        for i in range(0, len(flat), chunk_size):
                            rows_written += await _bulk_insert(
                                session, flat[i : i + chunk_size]
                            )

                log.info(
                    "polymarket.history.cycle",
                    eligible=len(tokens),
                    points_fetched=len(flat),
                    points_inserted=rows_written,
                    interval=self._interval,
                    fidelity=self._fidelity,
                )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("polymarket.history.cycle_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=rows_written if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=None,
                )

        if not success and error_message:
            raise RuntimeError(error_message)
        return rows_written
