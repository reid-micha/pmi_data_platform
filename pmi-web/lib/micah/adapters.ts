/**
 * Adapters: shape real pmi-api responses into the view-models the ported Micah
 * components consume. This is the seam that replaces the prototype's hardcoded
 * `window.MICAH` / `window.PMI_MODEL`. Server-only (calls the `api` client,
 * which uses the internal compose base on the server).
 */
import { api, PmiApiError } from "@/lib/api-client";
import type { PmiRowModel } from "@/components/micah/chrome";
import type {
  ExplainComponent,
  ExplainPayload,
  HistoryEnvelope,
  IndexSummary,
  ScoreEnvelope,
  SenateBoardPayload,
  StateLeanRow,
} from "@/lib/types";

/**
 * Soft-fail to `null` for the "no data" cases the Micah pages render as empty
 * states: a 404 from pmi-api (index/score not present yet) OR pmi-api being
 * unreachable entirely (connection refused / DNS). Other HTTP errors (500, 401)
 * are real and re-thrown so they surface rather than silently blanking the UI.
 */
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof PmiApiError) {
      if (e.status === 404) return null;
      throw e;
    }
    // Non-PmiApiError ⇒ the fetch itself failed (backend down). Degrade.
    return null;
  }
}

/** Compact USD volume, e.g. 1532000 → "$1.5M", 45200 → "$45.2k", 0 → "$0". */
export function formatVolume(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function fmtDay(iso: string): string {
  // "2026-06-04T..." → "Jun 4" (UTC, locale-stable for SSR hydration).
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export interface TimeChartModel {
  data: Array<number | null>;
  xLabels?: [string, string, string];
}

export function toTimeChart(history: HistoryEnvelope | null): TimeChartModel {
  const points = history?.data.points ?? [];
  if (points.length === 0) return { data: [] };
  const data = points.map((p) => (p.score == null ? null : p.score));
  const first = points[0].as_of;
  const mid = points[Math.floor((points.length - 1) / 2)].as_of;
  const last = points[points.length - 1].as_of;
  return { data, xLabels: [fmtDay(first), fmtDay(mid), fmtDay(last)] };
}

/** A component market rendered as a holding card/row. */
export interface HoldingModel {
  title: string;
  /** Raw venue id from pmi-api (e.g. "polymarket"); resolve with venueChip(). */
  venue: string;
  relationship: "Direct" | "Indirect";
  /** P(Yes) as a 0–100 pct, or null if no last price. */
  prob: number | null;
  /** Latest 24h traded volume, or null if unknown. */
  volume: number | null;
}

function toHolding(c: ExplainComponent): HoldingModel {
  return {
    title: c.title,
    venue: c.venue ?? "polymarket",
    relationship: c.relevancy >= 0.5 ? "Direct" : "Indirect",
    prob: c.last_price == null ? null : Math.round(c.last_price * 100),
    volume: c.volume_24h,
  };
}

export interface IndexDetailModel {
  id: string;
  title: string;
  score: number | null;
  componentCount: number;
  chart: TimeChartModel;
  /** Top holdings only (capped) — see holdingsTotal for the full count. */
  holdings: HoldingModel[];
  holdingsTotal: number;
  /** Distinct venues across ALL components (not just the shown holdings). */
  exchanges: string[];
  asOf: string | null;
}

// A war-index explain can return ~900 components; rendering them all is a
// multi-MB page. Show the most-relevant slice and surface the true total.
const HOLDINGS_CAP = 60;

/** Full single-index view-model (War Index, generic Question, etc.). */
export async function loadIndexDetail(id: string): Promise<IndexDetailModel | null> {
  const meta = await soft(api.getIndex(id));
  if (!meta) return null;
  const [score, history, explain] = await Promise.all([
    soft(api.getScore(id)),
    soft(api.getHistory(id, { limit: 500 })),
    soft(api.explainScore(id)),
  ]);
  const components = (explain as ExplainPayload | null)?.components ?? [];
  // Most-relevant first; tie-break on price so the headline holdings are the
  // ones actually moving the index.
  const ranked = [...components].sort(
    (a, b) => b.relevancy - a.relevancy || (b.last_price ?? 0) - (a.last_price ?? 0),
  );
  // Distinct venues across the whole component set, most-common first.
  const venueCounts = new Map<string, number>();
  for (const c of components) {
    const v = c.venue ?? "polymarket";
    venueCounts.set(v, (venueCounts.get(v) ?? 0) + 1);
  }
  const exchanges = [...venueCounts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  return {
    id: meta.id,
    title: meta.title,
    score: (score as ScoreEnvelope | null)?.data.score ?? null,
    componentCount: (score as ScoreEnvelope | null)?.data.component_count ?? components.length,
    chart: toTimeChart(history),
    holdings: ranked.slice(0, HOLDINGS_CAP).map(toHolding),
    holdingsTotal: components.length,
    exchanges,
    asOf: (score as ScoreEnvelope | null)?.data.as_of ?? null,
  };
}

/**
 * Senate board view-model. The distribution fields (majority probs, seat
 * counts, series) are real (Poisson-binomial, CORR-1.6); per-race state/matchup
 * attribution is null until CORR-1.3, so the table falls back to the market
 * title and the choropleth stays empty.
 */
export interface SenateBoardModel extends SenateBoardPayload {
  chart: TimeChartModel;
}

export async function loadSenateBoard(id: string): Promise<SenateBoardModel | null> {
  const env = await soft(api.senateBoard(id));
  if (!env) return null;
  const data = env.data;
  // series_14d is already on the 0–100 P(GOP majority) scale.
  const pts = data.series_14d;
  const chart: TimeChartModel =
    pts.length === 0 ? { data: [] } : { data: pts };
  return { ...data, chart };
}

/** MAGA-by-state choropleth model (Task #6). */
export interface MagaMapModel {
  dataByCode: Record<string, number>; // code → heat, for UsaMap
  states: Record<string, StateLeanRow>;
  national: number | null;
  nStates: number;
  nMarkets: number;
}

export async function loadMagaByState(): Promise<MagaMapModel | null> {
  const env = await soft(api.magaByState());
  if (!env) return null;
  const { states, national_heat, n_states, n_markets } = env.data;
  const dataByCode: Record<string, number> = {};
  for (const [code, row] of Object.entries(states)) dataByCode[code] = row.heat;
  return { dataByCode, states, national: national_heat, nStates: n_states, nMarkets: n_markets };
}

/** Rows for the World view's PMI list — every current index + its live score. */
export async function loadPmiList(): Promise<{ rows: PmiRowModel[]; error: string | null }> {
  let indexes: IndexSummary[];
  try {
    indexes = await api.listIndexes();
  } catch (e) {
    return {
      rows: [],
      error: e instanceof PmiApiError ? `${e.status} @ ${e.url}` : String(e),
    };
  }
  const rows = await Promise.all(
    indexes.map(async (ix): Promise<PmiRowModel> => {
      const score = await soft(api.getScore(ix.id));
      const s = (score as ScoreEnvelope | null)?.data;
      const value = s?.score ?? null;
      // Heat == score for now (0=Dem … 100=Rep). Probability indices read the
      // same scale. Falls back to neutral 50 when there's no score yet.
      const heat = value ?? 50;
      return {
        id: ix.id,
        href: `/micah/q/${encodeURIComponent(ix.id)}`,
        title: ix.title,
        score: value == null ? 0 : Math.round(value),
        scoreType: "score",
        heat,
        tags: ix.owner ? [ix.owner] : [],
        excs: ["polymarket"],
        extras: 0,
        contracts: s?.component_count ?? 0,
      };
    }),
  );
  return { rows, error: null };
}
