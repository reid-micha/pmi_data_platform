"""Unit tests for the ``seat_projection_sum`` aggregator branch.

Pure-Python, no DB / MLflow / network — builds ``MarketEvaluations`` with stub
``AuditEvaluation`` rows and asserts on the seat-projection score + breakdown.

What we lock in:

1. **Dispatch** — an index whose ``formula`` is ``seat_projection_sum`` routes
   to the Poisson-binomial path; the score is E[R seats] (a seat count), not a
   0..100 index, and ``breakdown["formula"]`` records the branch.
2. **Polarity collapse** — the score reuses ``extract_contested_seats``, so a
   "Democrats win <state>" market is read as ``1 - price`` and same-state R/D
   markets dedup to one seat (prefer the R market).
3. **Holdover geometry** — E[R seats] = holdover_r + Σ P(R wins) over contested
   seats, matching ``compute_seat_distribution``.
4. **Honest degradation** — markets that aren't per-state senate races (e.g.
   House districts) match no seats → ``score=None`` below ``min_components``.
"""

from __future__ import annotations

from pmi_core.dsl.ir import (
    AggregationSpec,
    CollapseSpec,
    FactorSpec,
    IndexDef,
    KeywordSelector,
    LiquidityWeighting,
    SeatProjectionSpec,
    WeightingSpec,
)
from pmi_core.engine.aggregator import MarketEvaluations, aggregate
from pmi_core.models import AuditEvaluation, CoreMarket


def _ir(
    *,
    min_components: int = 1,
    seat_projection: SeatProjectionSpec | None = None,
) -> IndexDef:
    return IndexDef(
        id="senate-seats-test",
        version=1,
        title="Senate Seats Test",
        owner="test",
        selectors=[KeywordSelector(type="keyword", terms=["senate"])],
        factors=[
            FactorSpec(
                id="is_senate_race_2026",
                type="binary",
                prompt_ref="prompts/factors/is-senate-race-2026-v1",
                weight=60,
            ),
            FactorSpec(
                id="republican_on_yes",
                type="binary",
                prompt_ref="prompts/factors/republican-on-yes-v1",
                weight=40,
            ),
        ],
        aggregation=AggregationSpec(
            collapse=CollapseSpec(enabled=True),
            min_components=min_components,
            formula="seat_projection_sum",
            seat_projection=seat_projection,
        ),
        weighting=WeightingSpec(liquidity=LiquidityWeighting(method="none")),
    )


def _row(market_id: int, title: str, last_price: float) -> MarketEvaluations:
    market = CoreMarket(
        id=market_id,
        venue="polymarket",
        external_id=f"ext-{market_id}",
        slug=None,
        title=title,
    )
    # One gating eval, just so component lineage has something to collect.
    ev = AuditEvaluation(
        id=market_id * 10,
        market_id=market_id,
        index_definition_id=1,
        factor_id="is_senate_race_2026",
        prompt_id=1,
        prompt_sha256="x" * 64,
        model_id="stub",
        value_numeric=1.0,
    )
    return MarketEvaluations(
        market=market,
        by_factor={"is_senate_race_2026": ev},
        last_price=last_price,
    )


# --------------------------------------------------------------------------
# Dispatch + expected seat count
# --------------------------------------------------------------------------


def test_score_is_expected_r_seats_with_holdover() -> None:
    rows = [
        _row(1, "Will the Republicans win the Ohio Senate race in 2026?", 0.80),
        _row(2, "Will the Republicans win the Texas Senate race in 2026?", 0.60),
    ]
    sp = SeatProjectionSpec(
        total_seats=100, majority_threshold=51, holdover_r=30, holdover_d=37
    )
    result = aggregate(rows, _ir(seat_projection=sp))

    # E[R] = holdover_r + 0.80 + 0.60 = 31.4
    assert result.score == 31.4
    assert result.component_count == 2
    assert result.breakdown["formula"] == "seat_projection_sum"
    assert result.breakdown["expected_r_seats"] == 31.4
    assert result.breakdown["n_contested"] == 2
    assert result.breakdown["holdover_r"] == 30
    # lineage flows through for the seat markets
    assert sorted(result.component_evaluation_ids) == [10, 20]


def test_democrat_market_counted_as_one_minus_price() -> None:
    # A "Democrats win" market collapses to P(R) = 1 - price.
    rows = [
        _row(1, "Will the Democrats win the Maine Senate race in 2026?", 0.70),
    ]
    result = aggregate(rows, _ir(seat_projection=SeatProjectionSpec()))
    # P(R) = 1 - 0.70 = 0.30; no holdover → E[R] = 0.30
    assert result.score == 0.30
    assert result.breakdown["n_contested"] == 1


def test_same_state_r_and_d_collapse_to_one_seat() -> None:
    rows = [
        _row(1, "Will the Republicans win the Georgia Senate race in 2026?", 0.55),
        _row(2, "Will the Democrats win the Georgia Senate race in 2026?", 0.45),
    ]
    result = aggregate(rows, _ir(seat_projection=SeatProjectionSpec()))
    # One Georgia seat, R market preferred → P(R) = 0.55
    assert result.breakdown["n_contested"] == 1
    assert result.score == 0.55


def test_default_geometry_when_seat_projection_omitted() -> None:
    rows = [_row(1, "Will the Republicans win the Ohio Senate race in 2026?", 0.90)]
    result = aggregate(rows, _ir(seat_projection=None))
    assert result.score == 0.90
    assert result.breakdown["total_seats"] == 100
    assert result.breakdown["holdover_r"] == 0


# --------------------------------------------------------------------------
# Honest degradation
# --------------------------------------------------------------------------


def test_non_senate_markets_yield_no_seats() -> None:
    # House-district / unrelated titles aren't matched by parse_seat_race.
    rows = [
        _row(1, "Will the Republicans win the 2026 House majority?", 0.60),
        _row(2, "Who will be the Republican nominee in Ohio?", 0.30),
    ]
    result = aggregate(rows, _ir(min_components=1, seat_projection=SeatProjectionSpec()))
    assert result.score is None
    assert result.component_count == 0
    assert result.breakdown["reason"] == "below min_components"
    assert result.breakdown["contested_seats"] == 0


def test_below_min_components_returns_none() -> None:
    rows = [_row(1, "Will the Republicans win the Ohio Senate race in 2026?", 0.80)]
    result = aggregate(rows, _ir(min_components=5, seat_projection=SeatProjectionSpec()))
    assert result.score is None
    assert result.breakdown["contested_seats"] == 1
