"""/indexes — list, get, score (current + history), explain."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_api.deps import get_session
from pmi_api.schemas import (
    ExplainComponent,
    ExplainPayload,
    HistoryEnvelope,
    HistoryPayload,
    HistoryPoint,
    IndexSummary,
    ScoreEnvelope,
    ScorePayload,
    SenateBoardEnvelope,
    SenateBoardPayload,
    SenateRace,
)
from pmi_core.dsl.ir import IndexDef
from pmi_core.engine.aggregator import _direction_value, _relevancy
from pmi_core.engine.seat_distribution import (
    band_counts,
    classify_band,
    compute_seat_distribution,
)
from pmi_core.engine.seat_mapping import extract_contested_seats
from pmi_core.models import (
    AuditEvaluation,
    CoreIndexDefinition,
    CoreMarket,
    TsIndexScore,
    TsPriceSnapshot,
)

router = APIRouter(prefix="/indexes", tags=["indexes"])


async def _current_def(session: AsyncSession, index_id: str) -> CoreIndexDefinition:
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
        # Fall back to highest version (in case is_current wasn't set during the
        # very first pipeline run — defensive at P0).
        row = (
            await session.execute(
                select(CoreIndexDefinition)
                .where(CoreIndexDefinition.index_id == index_id)
                .order_by(CoreIndexDefinition.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "INDEX_NOT_FOUND", "hint": "Try GET /indexes."}},
        )
    return row


@router.get("", response_model=list[IndexSummary])
async def list_indexes(session: AsyncSession = Depends(get_session)) -> list[CoreIndexDefinition]:
    rows = (
        await session.execute(
            select(CoreIndexDefinition)
            .where(CoreIndexDefinition.is_current.is_(True))
            .order_by(CoreIndexDefinition.index_id)
        )
    ).scalars().all()
    if not rows:
        rows = (
            await session.execute(
                select(CoreIndexDefinition).order_by(
                    CoreIndexDefinition.index_id,
                    CoreIndexDefinition.version.desc(),
                )
            )
        ).scalars().all()
    return list(rows)


@router.get("/{index_id}", response_model=IndexSummary)
async def get_index(
    index_id: str, session: AsyncSession = Depends(get_session)
) -> CoreIndexDefinition:
    return await _current_def(session, index_id)


@router.get("/{index_id}/score", response_model=ScoreEnvelope)
async def get_score(
    index_id: str,
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> ScoreEnvelope:
    index_def = await _current_def(session, index_id)
    stmt = select(TsIndexScore).where(TsIndexScore.index_definition_id == index_def.id)
    if as_of is not None:
        stmt = stmt.where(TsIndexScore.as_of <= as_of)
    stmt = stmt.order_by(desc(TsIndexScore.as_of)).limit(1)

    score = (await session.execute(stmt)).scalar_one_or_none()
    if score is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "NO_SCORE_YET",
                    "hint": "Run `just pmi-run polymarket-war-index` (or wait for next tick).",
                }
            },
        )
    return ScoreEnvelope(
        summary=(
            f"{index_def.title} (v{index_def.version}) = {float(score.score):.2f} "
            f"across {score.component_count} components as of "
            f"{score.as_of.isoformat()}"
        ),
        data=ScorePayload(
            index_id=index_def.index_id,
            version=index_def.version,
            as_of=score.as_of,
            score=float(score.score),
            component_count=score.component_count,
            computed_at=score.computed_at,
            breakdown=score.breakdown,
        ),
    )


@router.get("/{index_id}/score/history", response_model=HistoryEnvelope)
async def get_history(
    index_id: str,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    session: AsyncSession = Depends(get_session),
) -> HistoryEnvelope:
    index_def = await _current_def(session, index_id)
    stmt = select(TsIndexScore).where(TsIndexScore.index_definition_id == index_def.id)
    if from_ is not None:
        stmt = stmt.where(TsIndexScore.as_of >= from_)
    if to is not None:
        stmt = stmt.where(TsIndexScore.as_of <= to)
    stmt = stmt.order_by(TsIndexScore.as_of.asc()).limit(limit)

    rows = (await session.execute(stmt)).scalars().all()
    points = [
        HistoryPoint(
            as_of=r.as_of, score=float(r.score), component_count=r.component_count
        )
        for r in rows
    ]
    return HistoryEnvelope(
        summary=f"{index_def.title} (v{index_def.version}): {len(points)} points",
        data=HistoryPayload(
            index_id=index_def.index_id, version=index_def.version, points=points
        ),
    )


@router.get("/{index_id}/explain", response_model=ExplainPayload)
async def explain_score(
    index_id: str,
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> ExplainPayload:
    """Return the component breakdown of a particular score.

    P0 explanation: list the markets that fed into the latest score and their
    factor values. P1 wires an LLM synthesis pass (Visualisation M2).
    """
    index_def = await _current_def(session, index_id)
    stmt = select(TsIndexScore).where(TsIndexScore.index_definition_id == index_def.id)
    if as_of is not None:
        stmt = stmt.where(TsIndexScore.as_of <= as_of)
    stmt = stmt.order_by(desc(TsIndexScore.as_of)).limit(1)
    score = (await session.execute(stmt)).scalar_one_or_none()
    if score is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NO_SCORE_YET"}},
        )

    if not score.component_evaluation_ids:
        return ExplainPayload(
            index_id=index_def.index_id,
            version=index_def.version,
            as_of=score.as_of,
            score=float(score.score),
            components=[],
        )

    evals = (
        await session.execute(
            select(AuditEvaluation).where(AuditEvaluation.id.in_(score.component_evaluation_ids))
        )
    ).scalars().all()

    # Group AuditEvaluation rows by market so each market gets a dict[factor_id, eval]
    # that the shared `_relevancy` / `_direction_value` helpers can consume directly
    # (CORR-3.3 (c): single source of truth for the weighting math).
    by_market_evals: dict[int, dict[str, AuditEvaluation]] = {}
    by_market_factors: dict[int, dict[str, float | str | None]] = {}
    for e in evals:
        by_market_evals.setdefault(e.market_id, {})[e.factor_id] = e
        by_market_factors.setdefault(e.market_id, {})[e.factor_id] = (
            float(e.value_numeric) if e.value_numeric is not None else e.value_label
        )

    market_ids = list(by_market_evals.keys())
    markets = (
        await session.execute(select(CoreMarket).where(CoreMarket.id.in_(market_ids)))
    ).scalars().all() if market_ids else []
    title_by_id = {m.id: m.title for m in markets}

    # CORR-3.3 (b): join ts_price_snapshots to surface the price that fed into the
    # score. Take the most recent snapshot at-or-before `score.as_of` per market.
    # DISTINCT ON keeps the query single-pass without a window-function rewrite.
    last_price_by_market: dict[int, float | None] = {}
    if market_ids:
        latest_price_stmt = (
            select(
                TsPriceSnapshot.market_id,
                TsPriceSnapshot.last_price,
            )
            .where(
                TsPriceSnapshot.market_id.in_(market_ids),
                TsPriceSnapshot.snapshot_at <= score.as_of,
            )
            .order_by(
                TsPriceSnapshot.market_id,
                TsPriceSnapshot.snapshot_at.desc(),
            )
            .distinct(TsPriceSnapshot.market_id)
        )
        for mid, price in (await session.execute(latest_price_stmt)).all():
            last_price_by_market[mid] = float(price) if price is not None else None

    # Parse the IR once so we can call the aggregator helpers with the typed shape.
    ir = IndexDef.model_validate(index_def.definition)

    components = [
        ExplainComponent(
            market_id=mid,
            title=title_by_id.get(mid, "(unknown)"),
            last_price=last_price_by_market.get(mid),
            # CORR-3.3 (a): previously these were hard-coded to 0.0 because the
            # `setdefault` bucket was never mutated after construction. Now they
            # are computed from the loaded evaluations using the same helpers
            # the aggregator uses, so /explain matches /score exactly.
            relevancy=_relevancy(by_market_evals[mid], ir),
            direction=_direction_value(by_market_evals[mid]),
            factors=by_market_factors[mid],
        )
        for mid in by_market_evals
    ]

    return ExplainPayload(
        index_id=index_def.index_id,
        version=index_def.version,
        as_of=score.as_of,
        score=float(score.score),
        components=components,
    )


# Default chamber geometry when an index definition omits `aggregation.
# seat_projection` (CORR-1.2). Falls back to the US Senate shape with no
# holdover, which degrades to "every modelled seat is contested".
_SEAT_DEFAULTS = {
    "total_seats": 100,
    "majority_threshold": 51,
    "holdover_r": 0,
    "holdover_d": 0,
}


@router.get("/{index_id}/senate-board", response_model=SenateBoardEnvelope)
async def senate_board(
    index_id: str,
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> SenateBoardEnvelope:
    """Balance-of-power board for a seat-projection index (SHIP-2.5).

    Treats each component market's latest price as a per-seat P(Republican
    wins), folds them through the CORR-1.6 Poisson-binomial seat distribution
    (plus the holdover seats not on the ballot), and returns the full board
    contract consumed by the design's senate view.

    STEP 1 scope: the distribution fields are real; per-race attribution
    (state / matchup / incumbent / delta) is deferred to CORR-1.3, so
    ``prob_by_state`` is empty for now. This endpoint is generic over any
    index whose components are per-seat races — it's the senate suite that
    will use it first.
    """
    index_def = await _current_def(session, index_id)

    stmt = select(TsIndexScore).where(TsIndexScore.index_definition_id == index_def.id)
    if as_of is not None:
        stmt = stmt.where(TsIndexScore.as_of <= as_of)
    stmt = stmt.order_by(desc(TsIndexScore.as_of)).limit(1)
    score = (await session.execute(stmt)).scalar_one_or_none()
    if score is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NO_SCORE_YET", "hint": "Run the pipeline first."}},
        )

    # Component markets = distinct markets behind the score's evaluations.
    market_ids: list[int] = []
    if score.component_evaluation_ids:
        evals = (
            await session.execute(
                select(AuditEvaluation.market_id)
                .where(AuditEvaluation.id.in_(score.component_evaluation_ids))
                .distinct()
            )
        ).scalars().all()
        market_ids = list(evals)

    title_by_id: dict[int, str] = {}
    if market_ids:
        markets = (
            await session.execute(select(CoreMarket).where(CoreMarket.id.in_(market_ids)))
        ).scalars().all()
        title_by_id = {m.id: m.title for m in markets}

    # Latest price + volume at-or-before score.as_of, one row per market.
    price_by_market: dict[int, float] = {}
    volume_by_market: dict[int, float | None] = {}
    if market_ids:
        latest_price_stmt = (
            select(
                TsPriceSnapshot.market_id,
                TsPriceSnapshot.last_price,
                TsPriceSnapshot.volume_24h,
            )
            .where(
                TsPriceSnapshot.market_id.in_(market_ids),
                TsPriceSnapshot.snapshot_at <= score.as_of,
            )
            .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
            .distinct(TsPriceSnapshot.market_id)
        )
        for mid, price, vol in (await session.execute(latest_price_stmt)).all():
            if price is not None:
                price_by_market[mid] = float(price)
                volume_by_market[mid] = float(vol) if vol is not None else None

    # Chamber geometry from `aggregation.seat_projection` (CORR-1.2). Read the
    # raw definition dict (not the full IR) so the board never 500s on an
    # unrelated IR drift; fall back to the no-holdover Senate shape.
    agg = (index_def.definition or {}).get("aggregation") or {}
    sp = agg.get("seat_projection") or {}
    total_seats = int(sp.get("total_seats", _SEAT_DEFAULTS["total_seats"]))
    majority_threshold = int(
        sp.get("majority_threshold", _SEAT_DEFAULTS["majority_threshold"])
    )
    holdover_r = int(sp.get("holdover_r", _SEAT_DEFAULTS["holdover_r"]))
    holdover_d = int(sp.get("holdover_d", _SEAT_DEFAULTS["holdover_d"]))

    # CORR-1.3: collapse the broad component-market set into one probability
    # per contested seat. A "senate" keyword selector matches ~390 live markets
    # (nominee/primary, foreign senates, procedural, chamber brackets) — feeding
    # all of them to the Poisson-binomial gives E[R seats] > 100. seat_mapping
    # keeps only party-direct per-state races ("Will the Republicans win the
    # Ohio Senate race in 2026?") and dedups R/D markets of the same state to a
    # single seat, yielding the ~33 Class-II contested seats (fewer if not all
    # have markets yet).
    ordered_ids = [mid for mid in market_ids if mid in price_by_market]
    seats = extract_contested_seats(
        [(mid, title_by_id.get(mid, ""), price_by_market[mid]) for mid in ordered_ids]
    )
    contested_probs = [s.prob_r for s in seats]

    dist = compute_seat_distribution(
        contested_probs,
        holdover_r=holdover_r,
        holdover_d=holdover_d,
        total_seats=total_seats,
        majority_threshold=majority_threshold,
    )
    counts = band_counts(contested_probs, holdover_r=holdover_r, holdover_d=holdover_d)

    races = [
        SenateRace(
            market_id=s.market_id,
            title=title_by_id.get(s.market_id, "(unknown)"),
            prob_r=round(s.prob_r * 100.0, 2),
            band=classify_band(s.prob_r),
            volume_24h=volume_by_market.get(s.market_id),
            state=s.state_code,
        )
        for s in seats
    ]
    prob_by_state = {
        s.state_code: round(s.prob_r * 100.0, 2)
        for s in seats
        if s.state_code is not None
    }

    # series_14d: the chronological tail of stored scores (≤ score.as_of).
    hist_rows = (
        await session.execute(
            select(TsIndexScore.score)
            .where(
                TsIndexScore.index_definition_id == index_def.id,
                TsIndexScore.as_of <= score.as_of,
            )
            .order_by(TsIndexScore.as_of.desc())
            .limit(14)
        )
    ).scalars().all()
    series_14d = [float(s) for s in reversed(hist_rows)]

    d_secured = counts["safe-d"] + counts["likely-d"] + counts["lean-d"]
    r_secured = counts["safe-r"] + counts["likely-r"] + counts["lean-r"]

    payload = SenateBoardPayload(
        index_id=index_def.index_id,
        version=index_def.version,
        as_of=score.as_of,
        p_r_majority=round(dist.p_r_majority * 100.0, 2),
        p_d_majority=round(dist.p_d_majority * 100.0, 2),
        expected_r_seats=round(dist.expected_r_seats, 2),
        stdev_r_seats=round(dist.stdev_r_seats, 2),
        total_seats=total_seats,
        majority_threshold=majority_threshold,
        holdover_r=holdover_r,
        holdover_d=holdover_d,
        counts=counts,
        d_secured=d_secured,
        r_secured=r_secured,
        tossups=counts["tossup"],
        n_contested=dist.n_contested,
        races=races,
        prob_by_state=prob_by_state,
        series_14d=series_14d,
    )
    return SenateBoardEnvelope(
        summary=(
            f"{index_def.title} (v{index_def.version}): "
            f"P(R majority) = {payload.p_r_majority:.1f}%, "
            f"E[R seats] = {payload.expected_r_seats:.1f} "
            f"across {dist.n_contested} contested + "
            f"{holdover_r + holdover_d} holdover, as of {score.as_of.isoformat()}"
        ),
        data=payload,
    )
