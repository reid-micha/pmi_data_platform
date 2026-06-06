"""Trader cohort rollup.

Reads the trailing 30d (`cohort_window_days`) of `ts_trades` rows where the
chain indexer has stamped a maker_address / taker_address (`source='chain'`),
sums per-wallet notional in USDC, and writes:

* `core_traders.total_volume_usd`  ← sum
* `core_traders.cohort`            ← banded {whale, mid, retail, unknown}
* `core_traders.cohort_updated_at` ← now

This runs on its own cron beat (default daily), independent of the indexer.
Slow path on purpose — the SUM is cheap on indexed data, and ranking-style
queries don't belong in the hot trade-write loop.

Threshold bands
---------------
* whale  ≥ $100k   — CLAUDE.md §5 "whale-favored markets" weighting target.
* mid    ≥ $1k     — engaged retail / small institutions.
* retail < $1k     — most addresses; default-zero in aggregator weighting.
* unknown          — wallet present in core_traders but had zero rollup-window volume.

Future P1: thresholds become per-index_def (some indexes care about whales,
others want retail breadth as a signal).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from pmi_core.db import session_scope
from pmi_core.models import CoreTrader
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll

log = structlog.get_logger(__name__)

SOURCE = "polygon-cohort"

# Notional = price × size for the position-token side; CTF Exchange's
# OrderFilled cash side is already USDC, so summing `price * size` over
# rows where `source='chain'` is correct (matches what we store in ts_trades).
ROLLUP_SQL = text(
    """
    WITH wallets AS (
        SELECT
            COALESCE(maker_address, taker_address) AS addr,
            SUM(price * size) AS notional
        FROM ts_trades
        WHERE source = 'chain'
          AND traded_at >= :since
          AND (maker_address IS NOT NULL OR taker_address IS NOT NULL)
        GROUP BY 1
    )
    SELECT addr, notional
    FROM wallets
    WHERE addr IS NOT NULL
    """
)


def _classify(notional: float, whale_threshold: float, mid_threshold: float) -> str:
    if notional >= whale_threshold:
        return "whale"
    if notional >= mid_threshold:
        return "mid"
    return "retail"


async def run_cohort_rollup() -> int:
    """Recompute cohort bands. Returns the number of trader rows touched."""
    started = datetime.now(UTC)
    touched = 0
    success = True
    error_message: str | None = None

    window_days = ingest_settings.cohort_window_days
    whale_threshold = ingest_settings.cohort_whale_threshold_usd
    mid_threshold = ingest_settings.cohort_mid_threshold_usd

    try:
        since = datetime.now(UTC) - timedelta(days=window_days)
        async with session_scope() as session:
            rows = (await session.execute(ROLLUP_SQL, {"since": since})).all()

            now = datetime.now(UTC)
            for addr, notional in rows:
                notional_f = float(notional or 0)
                cohort = _classify(notional_f, whale_threshold, mid_threshold)
                stmt = pg_insert(CoreTrader).values(
                    address=addr,
                    total_volume_usd=notional_f,
                    cohort=cohort,
                    cohort_updated_at=now,
                    first_seen_at=now,
                    last_seen_at=now,
                    trade_count=0,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["address"],
                    set_={
                        "total_volume_usd": stmt.excluded.total_volume_usd,
                        "cohort": stmt.excluded.cohort,
                        "cohort_updated_at": stmt.excluded.cohort_updated_at,
                    },
                )
                await session.execute(stmt)
                touched += 1

            # Wallets present in core_traders but absent from the rollup window
            # → leave their cohort sticky at whatever it was. Resetting to
            # 'unknown' would churn signals every cycle for inactive wallets.

        log.info(
            "polygon.cohort.rollup",
            touched=touched,
            window_days=window_days,
            whale_threshold=whale_threshold,
            mid_threshold=mid_threshold,
        )
    except Exception as exc:
        success = False
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        log.error("polygon.cohort.failed", error=error_message)
    finally:
        finished = datetime.now(UTC)
        async with session_scope() as session:
            await record_poll(
                session,
                source=SOURCE,
                started_at=started,
                finished_at=finished,
                success=success,
                records=touched if success else None,
                error_class=None if success else "CohortRollupFailure",
                error_message=error_message,
                expected_records_24h=None,
            )

    if not success and error_message:
        raise RuntimeError(error_message)
    return touched
