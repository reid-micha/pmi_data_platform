"""Aggregator: collapse mutually-exclusive bucket → weighted aggregate of relevancy × direction.

Bucket collapse uses date-aware grouping with noisy-OR for calendar buckets
and arithmetic mean for multi-year deadline variants — see
``pmi_core.engine.bucket_collapser``. Ported from Micah's
``bucket_collapser.py`` (2026-05-29) which replaced the older
``mutually_exclusive.py`` sum-capped-at-1 approach.
"""

from __future__ import annotations

from dataclasses import dataclass

from pmi_core.dsl.ir import IndexDef
from pmi_core.engine.bucket_collapser import collapse_for_scoring
from pmi_core.models import AuditEvaluation, CoreMarket


@dataclass
class MarketEvaluations:
    market: CoreMarket
    by_factor: dict[str, AuditEvaluation]
    last_price: float | None


def _direction_value(evals: dict[str, AuditEvaluation]) -> float:
    """direction factor encodes -1 / 0 / +1; default to +1 if missing."""
    e = evals.get("direction")
    if e is None or e.value_numeric is None:
        return 1.0
    return float(e.value_numeric)


def _relevancy(evals: dict[str, AuditEvaluation], ir: IndexDef) -> float:
    """Σ(value × weight) / Σ(weight) over factors that carry a relevancy weight."""
    total_weight = 0.0
    weighted_sum = 0.0
    for factor in ir.factors:
        if factor.weight is None:
            continue
        e = evals.get(factor.id)
        if e is None or e.value_numeric is None:
            continue
        # Binary 0/1 in [0,1]; score in [0,1] expected. Ternary should not be weighted.
        value = float(e.value_numeric)
        weighted_sum += value * factor.weight
        total_weight += factor.weight
    if total_weight == 0:
        return 0.0
    return weighted_sum / total_weight


def _collapse(rows: list[MarketEvaluations], ir: IndexDef) -> list[MarketEvaluations]:
    """Bucket collapse: see ``pmi_core.engine.bucket_collapser``.

    Returns the unchanged input when ``ir.aggregation.collapse.enabled`` is
    False. The collapser is date-aware (uses ``parse_bucket_date`` /
    ``strip_date_suffix``) so it correctly identifies "...on June 20" /
    "...on June 21" as siblings while leaving "Will X happen?" + "Will Y
    happen?" alone.
    """
    return collapse_for_scoring(rows, ir)


@dataclass
class AggregationResult:
    score: float
    component_count: int
    component_evaluation_ids: list[int]
    breakdown: dict


def aggregate(rows: list[MarketEvaluations], ir: IndexDef) -> AggregationResult:
    """Return a 0..100 score + lineage IDs."""
    collapsed = _collapse(rows, ir)
    if len(collapsed) < ir.aggregation.min_components:
        return AggregationResult(
            score=0.0,
            component_count=0,
            component_evaluation_ids=[],
            breakdown={"reason": "below min_components", "candidates": len(collapsed)},
        )

    numerator = 0.0
    denominator = 0.0
    component_ids: list[int] = []

    for r in collapsed:
        relevancy = _relevancy(r.by_factor, ir)
        if relevancy <= 0:
            continue
        direction = _direction_value(r.by_factor)  # -1, 0, +1
        price = r.last_price if r.last_price is not None else 0.5
        numerator += relevancy * direction * price
        denominator += relevancy
        component_ids.extend(e.id for e in r.by_factor.values() if e.id is not None)

    if denominator == 0:
        return AggregationResult(
            score=0.0,
            component_count=len(collapsed),
            component_evaluation_ids=component_ids,
            breakdown={"reason": "zero relevancy across components"},
        )

    raw = numerator / denominator
    # raw lives in roughly [-1, +1]; map to 0..100 with 50 = neutral
    score = max(0.0, min(100.0, 50.0 + raw * 50.0))

    return AggregationResult(
        score=round(score, 4),
        component_count=len(collapsed),
        component_evaluation_ids=component_ids,
        breakdown={
            "raw": round(raw, 6),
            "components_after_collapse": len(collapsed),
            "components_pre_collapse": len(rows),
        },
    )
