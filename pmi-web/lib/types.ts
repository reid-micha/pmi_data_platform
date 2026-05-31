/**
 * Shapes mirror `pmi-api/pmi_api/schemas.py` (Pydantic v2). Hand-written for
 * now; CLAUDE.md §10 calls for `datamodel-code-generator` autogen from the
 * Pydantic schema — wire that in when the contract stabilises (P1 M5).
 *
 * Keep this file thin: types only, no runtime logic.
 */

export interface IndexSummary {
  id: string; // Pydantic alias of `index_id`
  version: number;
  title: string;
  is_current: boolean;
  owner: string | null;
  yaml_sha256: string;
  effective_from: string; // ISO 8601
}

export interface ScorePayload {
  index_id: string;
  version: number;
  as_of: string;
  score: number;
  component_count: number;
  computed_at: string;
  breakdown: Record<string, unknown> | null;
}

export interface ScoreEnvelope {
  summary: string;
  data: ScorePayload;
}

export interface HistoryPoint {
  as_of: string;
  score: number;
  component_count: number;
}

export interface HistoryPayload {
  index_id: string;
  version: number;
  points: HistoryPoint[];
}

export interface HistoryEnvelope {
  summary: string;
  data: HistoryPayload;
}

export interface ExplainComponent {
  market_id: number;
  title: string;
  last_price: number | null;
  relevancy: number;
  direction: number;
  factors: Record<string, number | string | null>;
}

export interface ExplainPayload {
  index_id: string;
  version: number;
  as_of: string;
  score: number;
  components: ExplainComponent[];
}

/**
 * Senate board (SHIP-2.5) — mirrors SenateBoardEnvelope in schemas.py.
 *
 * The distribution fields (p_r_majority / p_d_majority / expected_r_seats /
 * counts / series_14d) are real (CORR-1.6 Poisson-binomial). The per-race
 * attribution fields (state / matchup / incumbent_party / delta_14d /
 * contracts / exchanges) and `prob_by_state` are deferred to CORR-1.3 and
 * arrive null / empty until a market→seat mapping exists.
 */
export interface SenateRace {
  market_id: number;
  title: string;
  prob_r: number; // 0–100 P(Republican wins)
  band: string;
  volume_24h: number | null;
  state: string | null;
  matchup: string | null;
  incumbent_party: string | null;
  delta_14d: number | null;
  contracts: number | null;
  exchanges: string[];
}

export interface SenateBoardPayload {
  index_id: string;
  version: number;
  as_of: string;
  p_r_majority: number; // 0–100
  p_d_majority: number; // 0–100
  expected_r_seats: number;
  stdev_r_seats: number;
  total_seats: number;
  majority_threshold: number;
  holdover_r: number;
  holdover_d: number;
  counts: Record<string, number>; // band → seat count (incl. holdover in safes)
  d_secured: number;
  r_secured: number;
  tossups: number;
  n_contested: number;
  races: SenateRace[];
  prob_by_state: Record<string, number>; // empty until CORR-1.3
  series_14d: number[];
}

export interface SenateBoardEnvelope {
  summary: string;
  data: SenateBoardPayload;
}

export interface SourceHealthRow {
  source: string;
  status: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  records_24h: number | null;
  expected_records_24h: number | null;
  updated_at: string;
}

export interface ApiError {
  error: {
    code: string;
    hint?: string;
  };
}
