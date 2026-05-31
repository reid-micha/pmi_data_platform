"""IndexDef IR — the in-memory shape of a declarative PMI definition.

YAML on disk → `IndexDef.model_validate(yaml.safe_load(...))` → engine consumes IR.
At P0 we accept a deliberately narrow subset: keyword/category selectors, fixed factors
with constant weights, simple liquidity-weighted aggregation with bucket collapse.
P1 adds semantic selectors, computed weights, expression formulas.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator


class KeywordSelector(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["keyword"]
    terms: list[str] = Field(min_length=1)


class CategorySelector(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["category"]
    polymarket_tag: str


class SemanticSelector(BaseModel):
    """P1+ — included so YAML written today validates against a forward-compatible shape."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["semantic"]
    anchor: str
    min_similarity: float = Field(ge=0.0, le=1.0, default=0.78)


SelectorSpec = KeywordSelector | CategorySelector | SemanticSelector


class FactorSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: Literal["binary", "ternary", "score"]
    prompt_ref: str  # e.g. 'prompts/factors/directly_about_war-v1'
    weight: float | None = None  # None = does not participate in relevancy aggregation


class LiquidityWeighting(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: Literal["quantile", "linear", "none"] = "quantile"


class CollapseSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    max_spread_days: int = 30
    representative: Literal["max_probability", "highest_liquidity", "newest"] = "max_probability"


class SeatProjectionSpec(BaseModel):
    """Chamber geometry for seat-count / balance-of-power indexes (CORR-1.2).

    Only consulted by seat-projection formulas and the senate-board endpoint
    (engine/seat_distribution.py). A US Senate is 100 seats = ~33 contested
    (Class II, on the 2026 ballot) + ~67 holdover (Class I + III, not on the
    ballot). The holdover seats are constants added to every realization of
    the Poisson-binomial seat distribution; ``total_seats`` derives the other
    party's count, and ``majority_threshold`` is the tail boundary (51 for an
    outright Senate majority; pass total/2 to model a VP tie-break as control).

    The House is the natural zero-holdover case: all 435 seats are up every
    cycle, so ``holdover_r = holdover_d = 0`` and ``total_seats = 435``,
    ``majority_threshold = 218``.
    """

    model_config = ConfigDict(extra="forbid")
    total_seats: int = Field(default=100, ge=1)
    majority_threshold: int = Field(default=51, ge=1)
    holdover_r: int = Field(default=0, ge=0)
    holdover_d: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _check_seat_arithmetic(self) -> SeatProjectionSpec:
        if self.holdover_r + self.holdover_d > self.total_seats:
            raise ValueError(
                f"holdover_r + holdover_d ({self.holdover_r + self.holdover_d}) "
                f"exceeds total_seats ({self.total_seats})"
            )
        if self.majority_threshold > self.total_seats:
            raise ValueError(
                f"majority_threshold ({self.majority_threshold}) "
                f"exceeds total_seats ({self.total_seats})"
            )
        return self


class AggregationSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    collapse: CollapseSpec = Field(default_factory=CollapseSpec)
    min_components: int = 1
    formula: str = "weighted_average_x_100"  # P0 stub; P1 parses real expressions
    # CORR-1.2 — chamber geometry; only meaningful for seat-projection indexes.
    seat_projection: SeatProjectionSpec | None = None


class WeightingSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    liquidity: LiquidityWeighting = Field(default_factory=LiquidityWeighting)


class PublishSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cadence: Literal["real_time", "hourly", "every_2h", "daily"] = "every_2h"
    channels: list[Literal["api", "websocket", "webhook"]] = Field(default_factory=lambda: ["api"])


class IndexDef(BaseModel):
    """Top-level declarative PMI definition."""

    model_config = ConfigDict(extra="forbid")

    id: str
    version: int = Field(ge=1)
    title: str
    owner: str | None = None

    selectors: list[SelectorSpec] = Field(min_length=1)
    factors: list[FactorSpec] = Field(min_length=1)
    weighting: WeightingSpec = Field(default_factory=WeightingSpec)
    aggregation: AggregationSpec = Field(default_factory=AggregationSpec)
    publish: PublishSpec = Field(default_factory=PublishSpec)

    @model_validator(mode="after")
    def _check_relevancy_weights(self) -> IndexDef:
        weighted = [f for f in self.factors if f.weight is not None]
        if not weighted:
            raise ValueError("at least one factor must have a weight (relevancy participation)")
        total = sum(f.weight or 0 for f in weighted)
        if total <= 0:
            raise ValueError("sum of factor weights must be positive")
        return self


def load_index_def(path: str | Path) -> tuple[IndexDef, str, str]:
    """Read a YAML file and return (parsed IR, raw_text, sha256(raw_text))."""
    raw = Path(path).read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    ir = IndexDef.model_validate(data)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return ir, raw, digest
