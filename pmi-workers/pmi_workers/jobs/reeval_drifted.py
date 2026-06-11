"""`reeval-drifted` job — Tier 3 periodic re-evaluation trigger (CORR-5.2).

CLAUDE.md §6: "不每天全表跑；用 (價格漂移 > X%) 觸發". Instead of waiting for
the hourly cron, this job re-scores exactly the indexes whose latest score
contains a component market whose price drifted ≥ `PMI_DRIFT_THRESHOLD_PCT`
probability points vs ~`PMI_DRIFT_LOOKBACK_HOURS` ago.

What "re-evaluation" means here: factor evaluations are append-only and keyed
by (market, index_def, factor, prompt, model) — semantic verdicts like "is this
about war" don't change because a price moved, so the cache stays valid. What
DOES go stale on a price swing is the *score*: component prices, liquidity
weights, collapse representatives. A pipeline tick refreshes all of those.
Run it on a tighter cadence than the hourly `score-all` (e.g. every 10 min via
cron); when nothing drifted it's a cheap no-op.

Drift detection
---------------
Per component market of each current index's latest score row:
  p_now  = latest ts_price_snapshots.last_price
  p_then = latest snapshot at or before (now − lookback)
  drift  = |p_now − p_then| × 100   (probability points)
Markets younger than the lookback (no p_then) are skipped — a brand-new market
has no drift baseline.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select

from pmi_core.config import settings
from pmi_core.db import session_scope
from pmi_core.models import (
    AuditEvaluation,
    CoreIndexDefinition,
    TsIndexScore,
    TsPriceSnapshot,
)
from pmi_workers.registry import register

log = structlog.get_logger("pmi_workers.jobs.reeval_drifted")


async def _component_market_ids(session, index_def_ids: list[int]) -> dict[int, set[int]]:
    """Map index_definition_id → market ids in its LATEST score's components."""
    out: dict[int, set[int]] = {}
    for def_id in index_def_ids:
        score = (
            await session.execute(
                select(TsIndexScore)
                .where(TsIndexScore.index_definition_id == def_id)
                .order_by(TsIndexScore.as_of.desc())
                .limit(1)
            )
        ).scalars().first()
        if score is None or not score.component_evaluation_ids:
            continue
        rows = (
            await session.execute(
                select(AuditEvaluation.market_id).where(
                    AuditEvaluation.id.in_(score.component_evaluation_ids)
                )
            )
        ).scalars().all()
        out[def_id] = set(rows)
    return out


async def _drifted_markets(session, market_ids: set[int]) -> dict[int, float]:
    """Return {market_id: drift_points} for markets over the threshold."""
    if not market_ids:
        return {}
    cutoff = datetime.now(UTC) - timedelta(hours=settings.drift_lookback_hours)
    threshold = settings.drift_threshold_pct

    ids = list(market_ids)
    now_rows = (
        await session.execute(
            select(
                TsPriceSnapshot.market_id,
                TsPriceSnapshot.last_price,
                TsPriceSnapshot.snapshot_at,
            )
            .where(TsPriceSnapshot.market_id.in_(ids))
            .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
        )
    ).all()
    p_now: dict[int, float] = {}
    for mid, price, _ts in now_rows:
        if mid not in p_now and price is not None:
            p_now[mid] = float(price)

    then_rows = (
        await session.execute(
            select(
                TsPriceSnapshot.market_id,
                TsPriceSnapshot.last_price,
                TsPriceSnapshot.snapshot_at,
            )
            .where(
                TsPriceSnapshot.market_id.in_(ids),
                TsPriceSnapshot.snapshot_at <= cutoff,
            )
            .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
        )
    ).all()
    p_then: dict[int, float] = {}
    for mid, price, _ts in then_rows:
        if mid not in p_then and price is not None:
            p_then[mid] = float(price)

    drifted: dict[int, float] = {}
    for mid in market_ids:
        if mid in p_now and mid in p_then:
            drift = abs(p_now[mid] - p_then[mid]) * 100.0
            if drift >= threshold:
                drifted[mid] = round(drift, 2)
    return drifted


@register("reeval-drifted")
async def run() -> None:
    from pmi_core.engine import run_pipeline

    log.info(
        "reeval_drifted.start",
        threshold_pct=settings.drift_threshold_pct,
        lookback_hours=settings.drift_lookback_hours,
    )
    async with session_scope() as session:
        defs = (
            await session.execute(
                select(CoreIndexDefinition.id, CoreIndexDefinition.index_id).where(
                    CoreIndexDefinition.is_current.is_(True)
                )
            )
        ).all()
        def_ids = [d.id for d in defs]
        id_to_slug = {d.id: d.index_id for d in defs}
        components = await _component_market_ids(session, def_ids)

        to_rescore: dict[str, dict[int, float]] = {}
        for def_id, market_ids in components.items():
            drifted = await _drifted_markets(session, market_ids)
            if drifted:
                to_rescore[id_to_slug[def_id]] = drifted

    if not to_rescore:
        log.info("reeval_drifted.no_drift")
        return

    for index_id, drifted in to_rescore.items():
        top = sorted(drifted.items(), key=lambda kv: kv[1], reverse=True)[:5]
        log.info(
            "reeval_drifted.rescoring",
            index_id=index_id,
            drifted_markets=len(drifted),
            top_drifts=top,
        )
        try:
            result = await run_pipeline(index_id=index_id)
            log.info(
                "reeval_drifted.rescored",
                index_id=index_id,
                score=result.get("score"),
            )
        except Exception as exc:  # noqa: BLE001 - one index failing ≠ job dead
            log.error("reeval_drifted.failed", index_id=index_id, error=str(exc)[:200])

    log.info("reeval_drifted.done", indexes_rescored=len(to_rescore))
