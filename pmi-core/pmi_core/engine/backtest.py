"""Backtest workflow (CORR-8.1 flagship / SHIP-3.4) — replay an index over history.

Replays an index's score over the past N days using:

* the index's **current** definition (IR from ``core_index_definitions``),
* the **append-only factor evaluations** already in ``audit_evaluations``
  (semantic verdicts like "is this about war" are price-independent, so the
  cached rows ARE the historical truth — no LLM is called, the replay is $0),
* per-day **historical prices**: the latest ``ts_price_snapshots`` row at or
  before each replay point (CORR-3.10's /prices-history backfill is what makes
  this dense).

Each replay day is one durable workflow step — a worker crash at day 60/90
resumes at day 61 on queue retry. Nothing is written to ``ts_index_scores``:
backtest output lives in ``core_workflow_runs.result`` so the live series
stays a pure record of real ticks.

Honesty constraints (surfaced in the result, not hidden):

* Markets with no price snapshot at-or-before a replay point are excluded for
  that day (they didn't observably exist yet) — NOT defaulted to 0.5.
* Liquidity weighting uses the as-of snapshot's ``volume_24h`` (orderbook
  depth history is too sparse pre-CORR-4.3 to replay honestly).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select

from pmi_core.db import session_scope
from pmi_core.dsl.ir import IndexDef
from pmi_core.engine.aggregator import MarketEvaluations, aggregate
from pmi_core.models import (
    AuditEvaluation,
    CoreIndexDefinition,
    CoreMarket,
    TsPriceSnapshot,
)
from pmi_core.workflow import WorkflowContext, workflow

log = structlog.get_logger(__name__)


async def _current_def(session, index_id: str) -> CoreIndexDefinition:
    row = (
        await session.execute(
            select(CoreIndexDefinition)
            .where(
                CoreIndexDefinition.index_id == index_id,
                CoreIndexDefinition.is_current.is_(True),
            )
            .order_by(CoreIndexDefinition.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"index '{index_id}' has no current definition")
    return row


async def _evaluations_by_market(
    session, index_definition_id: int
) -> dict[int, dict[str, AuditEvaluation]]:
    """Latest evaluation per (market, factor) for this definition.

    'Latest' because Tier 2 escalations / model promotions append newer rows
    for the same factor; replay should use the same row the live aggregator
    would prefer today.
    """
    rows = (
        await session.execute(
            select(AuditEvaluation)
            .where(AuditEvaluation.index_definition_id == index_definition_id)
            .order_by(AuditEvaluation.evaluated_at.desc(), AuditEvaluation.id.desc())
        )
    ).scalars().all()
    out: dict[int, dict[str, AuditEvaluation]] = {}
    for e in rows:
        out.setdefault(e.market_id, {}).setdefault(e.factor_id, e)
    return out


async def score_index_as_of(index_id: str, as_of: datetime) -> dict:
    """One read-only replay tick: cached evals + prices-as-of → aggregate.

    Returns a JSON-safe point dict; never writes ts_index_scores.
    """
    async with session_scope() as session:
        index_def = await _current_def(session, index_id)
        ir = IndexDef.model_validate(index_def.definition)
        evals = await _evaluations_by_market(session, index_def.id)
        market_ids = list(evals.keys())
        if not market_ids:
            return {
                "as_of": as_of.isoformat(),
                "score": None,
                "component_count": 0,
                "markets_priced": 0,
                "reason": "no cached evaluations for this definition",
            }

        markets = (
            await session.execute(select(CoreMarket).where(CoreMarket.id.in_(market_ids)))
        ).scalars().all()

        # Latest snapshot at-or-before as_of, one row per market (DISTINCT ON).
        price_rows = (
            await session.execute(
                select(
                    TsPriceSnapshot.market_id,
                    TsPriceSnapshot.last_price,
                    TsPriceSnapshot.volume_24h,
                )
                .where(
                    TsPriceSnapshot.market_id.in_(market_ids),
                    TsPriceSnapshot.snapshot_at <= as_of,
                )
                .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
                .distinct(TsPriceSnapshot.market_id)
            )
        ).all()
        price_by_market = {
            mid: float(price) for mid, price, _vol in price_rows if price is not None
        }
        volume_by_market = {
            mid: (float(vol) if vol is not None else None) for mid, _price, vol in price_rows
        }

        rows = [
            MarketEvaluations(
                market=m,
                by_factor=evals[m.id],
                last_price=price_by_market[m.id],
                liquidity=volume_by_market.get(m.id),
            )
            for m in markets
            if m.id in price_by_market  # unpriced-as-of-day markets excluded
        ]
        result = aggregate(rows, ir)
        return {
            "as_of": as_of.isoformat(),
            "score": result.score,
            "component_count": result.component_count,
            "markets_priced": len(rows),
        }


@workflow("backtest")
async def backtest(
    ctx: WorkflowContext,
    index_id: str,
    days: int = 90,
    step_hours: int = 24,
    end: str | None = None,
) -> dict:
    """Replay `index_id` over the trailing window, one durable step per point."""
    end_at = datetime.fromisoformat(end) if end else datetime.now(UTC)
    if end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=UTC)
    n_points = max(1, int(days * 24 / step_hours))
    points_at = [
        end_at - timedelta(hours=step_hours * i) for i in range(n_points - 1, -1, -1)
    ]
    await ctx.set_steps_total(len(points_at))

    points: list[dict] = []
    for at in points_at:
        key = f"point:{at.isoformat(timespec='seconds')}"
        points.append(await ctx.step(key, score_index_as_of, index_id, at))

    scored = [p for p in points if p.get("score") is not None]
    log.info(
        "backtest.done",
        index_id=index_id,
        points=len(points),
        scored=len(scored),
    )
    return {
        "index_id": index_id,
        "days": days,
        "step_hours": step_hours,
        "end": end_at.isoformat(),
        "points": points,
        "n_points": len(points),
        "n_scored": len(scored),
    }
