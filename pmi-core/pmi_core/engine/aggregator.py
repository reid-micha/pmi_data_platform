"""Aggregator: collapse mutually-exclusive bucket → weighted aggregate of relevancy × direction.

Bucket collapse uses date-aware grouping with noisy-OR for calendar buckets
and arithmetic mean for multi-year deadline variants — see
``pmi_core.engine.bucket_collapser``. Ported from Micah's
``bucket_collapser.py`` (2026-05-29) which replaced the older
``mutually_exclusive.py`` sum-capped-at-1 approach.

CORR-3.4 — quantile liquidity weighting using ``ts_orderbook_snapshots.
*_depth_1pct`` as the primary signal and ``ts_price_snapshots.volume_24h``
as the cold-start fallback. Ladder mirrors Micah's
``source_weights.get_source_weight`` (0.90 / 1.00 / 1.20 / 1.50) so the
shape is familiar; only the *input* changed from cross-source volume to
intra-venue book depth, which is a better proxy for "is this price
trustworthy".
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pmi_core.dsl.ir import IndexDef
from pmi_core.engine.bucket_collapser import collapse_for_scoring
from pmi_core.models import AuditEvaluation, CoreMarket


@dataclass
class MarketEvaluations:
    market: CoreMarket
    by_factor: dict[str, AuditEvaluation]
    last_price: float | None
    # CORR-3.4: orderbook depth_1pct (bid+ask) when present, else
    # volume_24h fallback, else None. The aggregator handles None as
    # "no signal → neutral weight 1.0" so cold-start markets aren't punished.
    liquidity: float | None = field(default=None)


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


# CORR-3.4 — quantile bucket ladder. Same shape as Micah's source_weights
# (0.90 / 1.00 / 1.20 / 1.50) so the relative dampening / boosting is
# familiar; minimum sample size (4) is the smallest N where p20/p50/p80
# yield three distinct cut points after interpolation. Below that we
# return uniform 1.0, which collapses back to the pre-CORR-3.4 behaviour
# and keeps tiny indexes from being volatility-amplified by quantiles
# computed off ~2 markets.
_LIQUIDITY_MIN_SAMPLE = 4
_LIQUIDITY_BUCKETS = (
    (0.20, 0.90),   # bottom quintile — thin book, discount
    (0.50, 1.00),   # 20–50 — neutral
    (0.80, 1.20),   # 50–80 — above median, modest boost
    (1.00, 1.50),   # 80–100 — deep book, strong boost
)


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Linear-interpolated percentile (matches numpy's default 'linear' method
    and Micah's ``calculate_volume_stats``)."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    k = (n - 1) * p
    f = int(k)
    frac = k - f
    if f + 1 < n:
        return sorted_vals[f] + frac * (sorted_vals[f + 1] - sorted_vals[f])
    return sorted_vals[f]


def _liquidity_weights(
    rows: list[MarketEvaluations], ir: IndexDef
) -> tuple[dict[int, float], dict]:
    """Return ``{market_id: weight}`` per ``WeightingSpec.liquidity.method``.

    Markets with no liquidity signal (None or ≤ 0) are always weighted 1.0
    regardless of method so cold-start markets degrade gracefully instead
    of being silently zeroed-out. The second return value is a small
    breakdown dict for ``audit_pipeline_runs`` / ``ts_index_scores.breakdown``
    so an operator can see *why* a tick produced a particular score.
    """
    method = ir.weighting.liquidity.method
    default = {r.market.id: 1.0 for r in rows}
    info = {
        "method": method,
        "sample_size": 0,
        "applied": False,
    }

    if method == "none":
        return default, info

    samples = [
        (r.market.id, float(r.liquidity))
        for r in rows
        if r.liquidity is not None and r.liquidity > 0
    ]
    info["sample_size"] = len(samples)
    if len(samples) < _LIQUIDITY_MIN_SAMPLE:
        info["reason"] = f"sample_size<{_LIQUIDITY_MIN_SAMPLE}; falling back to uniform"
        return default, info

    sorted_vals = sorted(d for _, d in samples)
    if sorted_vals[0] == sorted_vals[-1]:
        info["reason"] = "no variance in liquidity; falling back to uniform"
        return default, info

    if method == "quantile":
        p20 = _percentile(sorted_vals, 0.20)
        p50 = _percentile(sorted_vals, 0.50)
        p80 = _percentile(sorted_vals, 0.80)

        def bucket(d: float) -> float:
            if d < p20:
                return _LIQUIDITY_BUCKETS[0][1]
            if d < p50:
                return _LIQUIDITY_BUCKETS[1][1]
            if d < p80:
                return _LIQUIDITY_BUCKETS[2][1]
            return _LIQUIDITY_BUCKETS[3][1]

        weights = dict(default)
        for mid, d in samples:
            weights[mid] = bucket(d)
        info.update({"applied": True, "p20": p20, "p50": p50, "p80": p80})
        return weights, info

    if method == "linear":
        max_d = sorted_vals[-1]
        weights = dict(default)
        # Map (0, max_d] → [0.5, 1.5] linearly so dynamic range matches the
        # quantile ladder's outer bounds.
        for mid, d in samples:
            weights[mid] = max(0.5, min(1.5, 0.5 + d / max_d))
        info.update({"applied": True, "max_d": max_d})
        return weights, info

    # Unknown method → fall back. Shouldn't happen given the IR's Literal,
    # but stays defensive in case the schema is widened.
    info["reason"] = f"unknown method '{method}'; falling back to uniform"
    return default, info


@dataclass
class AggregationResult:
    # None when the index can't produce a meaningful score this tick
    # (below ``min_components`` or zero weighted relevancy). Persisting NULL
    # rather than 0.0 prevents the API from returning a stale-looking real
    # value when the real story is "no data" — Micah backport, see
    # micah PR #316 / job-executor PR #12.
    score: float | None
    component_count: int
    component_evaluation_ids: list[int]
    breakdown: dict


def aggregate(rows: list[MarketEvaluations], ir: IndexDef) -> AggregationResult:
    """Return a 0..100 score + lineage IDs. ``score`` is None when no score
    can be computed (insufficient components or zero relevancy)."""
    collapsed = _collapse(rows, ir)
    if len(collapsed) < ir.aggregation.min_components:
        return AggregationResult(
            score=None,
            component_count=0,
            component_evaluation_ids=[],
            breakdown={"reason": "below min_components", "candidates": len(collapsed)},
        )

    liquidity_weights, liquidity_info = _liquidity_weights(collapsed, ir)

    numerator = 0.0
    denominator = 0.0
    component_ids: list[int] = []

    for r in collapsed:
        relevancy = _relevancy(r.by_factor, ir)
        if relevancy <= 0:
            continue
        direction = _direction_value(r.by_factor)  # -1, 0, +1
        price = r.last_price if r.last_price is not None else 0.5
        liq = liquidity_weights.get(r.market.id, 1.0)
        numerator += relevancy * direction * price * liq
        denominator += relevancy * liq
        component_ids.extend(e.id for e in r.by_factor.values() if e.id is not None)

    if denominator == 0:
        return AggregationResult(
            score=None,
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
            "liquidity_weighting": liquidity_info,
        },
    )
