"""Pydantic response shapes — stable contract for pmi-web + MCP server."""

from __future__ import annotations

from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class IndexSummary(BaseModel):
    """Public shape — `id` is the slug (matches MCP convention in CLAUDE.md §8)."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # Map CoreIndexDefinition.index_id → response field `id`.
    id: str = Field(validation_alias=AliasChoices("index_id", "id"))
    version: int
    title: str
    is_current: bool
    owner: str | None = None
    yaml_sha256: str
    effective_from: datetime


class ScoreEnvelope(BaseModel):
    """Generic envelope: `summary` + `data` so MCP can hand it to an agent unchanged."""

    summary: str
    data: ScorePayload


class ScorePayload(BaseModel):
    index_id: str
    version: int
    as_of: datetime
    # None when the index couldn't produce a score this tick (below
    # min_components / zero relevancy). The pipeline persists NULL rather
    # than 0.0 so the UI shows "no data" instead of a stale-looking real
    # value. See ts_index_scores migration 0006.
    score: float | None
    component_count: int
    computed_at: datetime
    breakdown: dict | None


class HistoryPoint(BaseModel):
    as_of: datetime
    score: float | None
    component_count: int


class HistoryPayload(BaseModel):
    index_id: str
    version: int
    points: list[HistoryPoint]


class HistoryEnvelope(BaseModel):
    summary: str
    data: HistoryPayload


# --------------------------------------------------------------------------
# Job queue + durable workflows (CORR-4.6 / CORR-8.1, Postgres-backed).
# The §3.2 on-demand path returns 202 + a JobEnvelope when the cached score
# (latest ts_index_scores row) is staler than the caller's max_age_s.
# --------------------------------------------------------------------------


class JobPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Field name is `job_id` in responses; ORM attr is `id`.
    job_id: int = Field(validation_alias=AliasChoices("id", "job_id"))
    name: str
    status: str  # queued | running | succeeded | failed
    attempts: int
    max_attempts: int
    enqueued_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    result: dict | None = None


class JobEnvelope(BaseModel):
    summary: str
    data: JobPayload


class WorkflowRunPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workflow_run_id: int = Field(validation_alias=AliasChoices("id", "workflow_run_id"))
    workflow: str
    status: str  # queued | running | succeeded | failed | cancelled
    args: dict
    steps_done: int
    steps_total: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    result: dict | None = None


class WorkflowRunEnvelope(BaseModel):
    summary: str
    data: WorkflowRunPayload


class SourceHealthRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    source: str
    status: str
    last_success_at: datetime | None
    last_failure_at: datetime | None
    consecutive_failures: int
    records_24h: int | None
    expected_records_24h: int | None
    updated_at: datetime


class ExplainComponent(BaseModel):
    market_id: int
    title: str
    last_price: float | None
    relevancy: float
    direction: float
    factors: dict[str, float | str | None]
    # Venue (exchange) the market trades on, e.g. "polymarket" / "kalshi", and
    # its latest 24h volume — surfaced so holdings cards show the real exchange
    # + traded volume instead of a hard-coded placeholder.
    venue: str | None = None
    volume_24h: float | None = None


class ExplainPayload(BaseModel):
    index_id: str
    version: int
    as_of: datetime
    score: float | None
    components: list[ExplainComponent]


# --------------------------------------------------------------------------
# Senate board (SHIP-2.5) — drives the design's senate seat-board UI
# (pmi-new-frontend/views-senate.jsx). Computed from the CORR-1.6
# Poisson-binomial seat distribution over the index's component markets.
#
# STEP 1 SCOPE (contract + happy path): the *distribution* fields
# (p_r_majority / p_d_majority / expected_r_seats / counts / series_14d) are
# REAL — derived from component market prices via
# `pmi_core.engine.seat_distribution`. The per-race *attribution* fields
# (state / matchup / incumbent_party / delta_14d / contracts / exchanges) are
# best-effort and mostly null until CORR-1.3 (condition_id grouping) gives a
# proper market→seat mapping. `prob_by_state` is therefore empty until then.
#
# Field names are snake_case to match the rest of pmi-api; the pmi-web
# `lib/types.ts` adapter maps them to the board's camelCase
# (p_r_majority → pmiGOPMajority, etc.) in SHIP-2.5 (b).
# --------------------------------------------------------------------------


class SenateRace(BaseModel):
    """One contested seat. ``prob_r`` is P(Republican wins) as a 0–100 pct."""

    market_id: int
    title: str
    prob_r: float
    band: str
    volume_24h: float | None = None
    # CORR-1.3 attribution. state = title parse; matchup = candidate names from
    # groupItemTitle (null while the race only has generic party labels);
    # delta_14d = P(R) change vs the snapshot ≥14d prior (null without history);
    # contracts / exchanges = the seat's underlying per-party markets.
    state: str | None = None
    matchup: str | None = None
    # Still null — no ingested source carries incumbency yet.
    incumbent_party: str | None = None
    delta_14d: float | None = None
    contracts: int | None = None
    exchanges: list[str] = Field(default_factory=list)


class SenateBoardPayload(BaseModel):
    index_id: str
    version: int
    as_of: datetime

    # Balance-of-power (CORR-1.6), expressed 0–100 for the board tiles.
    p_r_majority: float
    p_d_majority: float
    expected_r_seats: float
    stdev_r_seats: float
    total_seats: int
    majority_threshold: int
    holdover_r: int
    holdover_d: int

    # Seat tally — 7 bands (safe-d … safe-r) incl. holdover folded into safes.
    counts: dict[str, int]
    d_secured: int
    r_secured: int
    tossups: int
    n_contested: int

    races: list[SenateRace]
    prob_by_state: dict[str, float]
    # ``None`` slots are ticks where the index produced no score (below
    # min_components etc.); the board renders them as gaps rather than 0.
    series_14d: list[float | None]


class SenateBoardEnvelope(BaseModel):
    summary: str
    data: SenateBoardPayload


# --------------------------------------------------------------------------
# MAGA-by-state (Task #6) — drives the National MAGA Index choropleth + State
# detail view. Per-state partisan lean derived on demand from the partisan
# general-election race markets already ingested (pmi_core.engine.state_lean),
# rather than 50 standalone state index definitions.
# --------------------------------------------------------------------------


class StateLeanRow(BaseModel):
    state: str            # canonical name, e.g. "North Carolina"
    state_code: str       # 2-letter code, e.g. "NC"
    heat: float           # 0–100, 100 = deep Republican
    n_markets: int        # contributing race markets
    offices: list[str]    # distinct offices (senate / governor / house)
    volume_24h: float


class MagaByStatePayload(BaseModel):
    as_of: datetime
    # Keyed by 2-letter state code; states with no recognised market are absent.
    states: dict[str, StateLeanRow]
    # Volume-weighted national lean across all contributing markets (0–100).
    national_heat: float | None
    n_states: int
    n_markets: int


class MagaByStateEnvelope(BaseModel):
    summary: str
    data: MagaByStatePayload


# --- State detail: per-chamber groups + contributing contracts ---------------


class MagaRaceContractRow(BaseModel):
    market_id: int
    title: str
    venue: str
    yes_pct: float          # the market's own latest YES probability, 0–100
    p_r: float              # directed P(Republican wins), 0–1
    volume_24h: float | None
    slug: str | None


class MagaGroupRow(BaseModel):
    state: str
    state_code: str
    office: str             # senate / governor / house
    district: int | None = None
    heat: float             # 0–100, 100 = deep Republican
    n_markets: int
    volume_24h: float
    base_question: str
    contracts: list[MagaRaceContractRow]


class MagaStateDetailPayload(BaseModel):
    state: str
    state_code: str
    heat: float
    n_markets: int
    volume_24h: float
    offices: list[str]
    groups: list[MagaGroupRow]


class MagaStateDetailEnvelope(BaseModel):
    summary: str
    data: MagaStateDetailPayload


class MagaGroupsPayload(BaseModel):
    as_of: datetime
    groups: list[MagaGroupRow]
    n_states: int
    n_markets: int


class MagaGroupsEnvelope(BaseModel):
    summary: str
    data: MagaGroupsPayload


class MagaTrendPoint(BaseModel):
    date: str               # ISO date, e.g. "2026-06-07"
    value: float            # state heat 0–100 that day


class MagaTrendsPayload(BaseModel):
    state_code: str
    days: int
    points: list[MagaTrendPoint]


class MagaTrendsEnvelope(BaseModel):
    summary: str
    data: MagaTrendsPayload


class MagaNationalTrendsPayload(BaseModel):
    days: int
    points: list[MagaTrendPoint]


class MagaNationalTrendsEnvelope(BaseModel):
    summary: str
    data: MagaNationalTrendsPayload


class MagaLastUpdatedPayload(BaseModel):
    generated_at: datetime | None   # None when no race-market snapshot exists


class MagaLastUpdatedEnvelope(BaseModel):
    summary: str
    data: MagaLastUpdatedPayload


class AppSettingsResponse(BaseModel):
    """Client-facing app settings (legacy war-index /api/settings shape)."""

    future_phrase: str


class PromptRecord(BaseModel):
    """One prompt as the admin editor sees it (legacy /api/admin/prompts shape).

    ``content`` maps to ``core_prompts.template``; ``model`` / ``temperature``
    surface the active production factor model bound to that prompt version
    (display-only — promotion happens via `pmi-core models`). ``top_p`` /
    ``reasoning_effort`` have no platform equivalent yet and stay None.
    """

    content: str
    model: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    reasoning_effort: str | None = None


class PromptsSaveResponse(BaseModel):
    status: str
    # name → new version number, only for prompts whose content actually changed
    new_versions: dict[str, int]


# resolve forward ref
ScoreEnvelope.model_rebuild()
HistoryEnvelope.model_rebuild()
