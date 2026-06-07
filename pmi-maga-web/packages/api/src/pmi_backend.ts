/**
 * Opt-in bridge from the maga-index client to the pmi platform (pmi-api).
 *
 * Activated ONLY when `VITE_PMI_API_URL` is set (a browser-reachable pmi-api
 * base, e.g. http://localhost:8001). When unset, the maga client stays 100% on
 * the legacy war-index backend — i.e. the 1:1 clone default is untouched.
 *
 * Scope: only pmi-api's `/maga/by-state` is mapped, because it's the one
 * endpoint whose data (per-state partisan lean + national heat) lines up with
 * what the homepage US map and state cards consume. Detail / question / region /
 * search pages have no pmi-api source yet, so they remain on the legacy backend.
 *
 * Requires pmi-api CORS to allow the SPA origin — set
 * `PMI_API_CORS_ORIGINS=http://localhost:5173` in the pmi-api env.
 */
import type {
  ComponentContract,
  MagaIndexData,
  MagaQuestion,
  MagaSearchCatalogResponse,
  MagaState,
  MagaStateDetail,
  MagaStateHoldingsData,
  TrendPoint,
} from '@micah/types';
import type { MagaChamberType, MagaGroup, MagaViewType } from './maga';

interface PmiStateLeanRow {
  state: string;       // canonical full name, e.g. "North Carolina"
  state_code: string;  // 2-letter, e.g. "NC"
  heat: number;        // 0–100, 100 = deep Republican
  n_markets: number;
  offices: string[];   // distinct offices: senate / governor / house
  volume_24h: number;
}
interface PmiByStateEnvelope {
  summary: string;
  data: {
    as_of: string;
    states: Record<string, PmiStateLeanRow>;
    national_heat: number | null;
    n_states: number;
    n_markets: number;
  };
}

/** pmi-api base when the bridge is enabled, else null (→ caller uses legacy). */
export function pmiApiBase(): string | null {
  const raw =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PMI_API_URL) ||
    '';
  return raw ? String(raw).replace(/\/+$/, '') : null;
}

export function isPmiBacked(): boolean {
  return pmiApiBase() != null;
}

function rowToMagaState(r: PmiStateLeanRow): MagaState {
  return {
    id: r.state_code,
    name: r.state, // full name — the US map keys on geo name.toLowerCase()
    pmiScore: r.heat,
    activeContractsCount: r.n_markets,
    sourceNames: ['polymarket'],
  };
}

/** Chamber tabs filter by office; 'all'/'state' keep every state. */
function matchesView(r: PmiStateLeanRow, view: MagaViewType): boolean {
  if (view === 'all' || view === 'state') return true;
  return r.offices.includes(view);
}

async function fetchByState(): Promise<PmiByStateEnvelope> {
  const base = pmiApiBase();
  if (!base) throw new Error('fetchByState() called without VITE_PMI_API_URL');
  const res = await fetch(`${base}/maga/by-state`);
  if (!res.ok) throw new Error(`pmi-api /maga/by-state → ${res.status}`);
  return res.json() as Promise<PmiByStateEnvelope>;
}

export async function fetchMagaStatesFromPmi(view: MagaViewType): Promise<MagaState[]> {
  const env = await fetchByState();
  return Object.values(env.data.states)
    .filter((r) => matchesView(r, view))
    .map(rowToMagaState);
}

export async function fetchMagaIndexFromPmi(view: MagaViewType): Promise<MagaIndexData> {
  const env = await fetchByState();
  const states = Object.values(env.data.states)
    .filter((r) => matchesView(r, view))
    .map(rowToMagaState);
  return {
    pmiScore: env.data.national_heat,
    activeContractsCount: env.data.n_markets,
    holdingsCount: env.data.n_markets,
    sourceNames: ['polymarket'],
    trendData: [], // /maga/by-state carries no history series
    states,
  };
}

// --- State detail / groups (pmi-api /maga/by-state/{code} + /maga/groups) -----

interface PmiRaceContract {
  market_id: number;
  title: string;
  venue: string;
  yes_pct: number; // market's own YES %, 0–100
  p_r: number; // directed P(Republican), 0–1
  volume_24h: number | null;
  slug: string | null;
}
interface PmiGroupRow {
  state: string;
  state_code: string;
  office: string; // senate / governor / house
  district: number | null;
  heat: number;
  n_markets: number;
  volume_24h: number;
  base_question: string;
  contracts: PmiRaceContract[];
}
interface PmiStateDetailEnvelope {
  summary: string;
  data: {
    state: string;
    state_code: string;
    heat: number;
    n_markets: number;
    volume_24h: number;
    offices: string[];
    groups: PmiGroupRow[];
  };
}
interface PmiGroupsEnvelope {
  summary: string;
  data: { as_of: string; groups: PmiGroupRow[]; n_states: number; n_markets: number };
}

/** Build a venue deep-link from a market slug (polymarket only; else null). */
function contractUrl(c: PmiRaceContract): string | null {
  if (c.slug && c.venue === 'polymarket') return `https://polymarket.com/event/${c.slug}`;
  return null;
}

function toComponentContract(c: PmiRaceContract): ComponentContract {
  return {
    title: c.title,
    website: c.venue,
    yesPercent: c.yes_pct,
    volume: c.volume_24h,
    url: contractUrl(c),
    directLink: 1, // per-state race markets are direct components
  };
}

/** Distinct venues across a group's contracts (for sourceNames). */
function groupSources(g: PmiGroupRow): string[] {
  return [...new Set(g.contracts.map((c) => c.venue))];
}

function rowToMagaGroup(g: PmiGroupRow): MagaGroup {
  return {
    id: `${g.state_code}-${g.office}`,
    chamber: g.office as MagaChamberType,
    stateId: g.state_code,
    stateAbbr: g.state_code,
    district: g.district,
    baseQuestion: g.base_question,
    pmiScore: g.heat,
    activeContractsCount: g.n_markets,
    sourceNames: groupSources(g),
    contracts: g.contracts.map(toComponentContract),
  };
}

async function fetchStateDetail(code: string): Promise<PmiStateDetailEnvelope | null> {
  const base = pmiApiBase();
  if (!base) throw new Error('fetchStateDetail() called without VITE_PMI_API_URL');
  const res = await fetch(`${base}/maga/by-state/${encodeURIComponent(code.toUpperCase())}`);
  if (res.status === 404) return null; // state has no race markets
  if (!res.ok) throw new Error(`pmi-api /maga/by-state/${code} → ${res.status}`);
  return res.json() as Promise<PmiStateDetailEnvelope>;
}

async function fetchGroups(chamber?: MagaChamberType): Promise<PmiGroupRow[]> {
  const base = pmiApiBase();
  if (!base) throw new Error('fetchGroups() called without VITE_PMI_API_URL');
  const q = chamber ? `?chamber=${encodeURIComponent(chamber)}` : '';
  const res = await fetch(`${base}/maga/groups${q}`);
  if (!res.ok) throw new Error(`pmi-api /maga/groups → ${res.status}`);
  const env = (await res.json()) as PmiGroupsEnvelope;
  return env.data.groups;
}

export async function fetchMagaStateFromPmi(stateId: string): Promise<MagaStateDetail> {
  const env = await fetchStateDetail(stateId);
  if (!env) {
    // Empty-but-valid detail so the page renders an empty state, not an error.
    return { id: stateId, name: stateId, pmiScore: null, trendData: [], groups: [] };
  }
  const d = env.data;
  const sources = [...new Set(d.groups.flatMap(groupSources))];
  return {
    id: d.state_code,
    name: d.state,
    pmiScore: d.heat,
    activeContractsCount: d.n_markets,
    holdingsCount: d.n_markets,
    sourceNames: sources,
    componentExchanges: sources.length,
    trendData: [], // per-state history not available from pmi yet
    groups: d.groups.map((g) => ({
      id: `${g.state_code}-${g.office}`,
      chamber: g.office,
      district: g.district,
      pmiScore: g.heat,
      activeContractsCount: g.n_markets,
      stateAbbr: g.state_code,
      baseQuestion: g.base_question,
      sourceNames: groupSources(g),
    })),
  };
}

export async function fetchMagaStateHoldingsFromPmi(
  stateId: string,
  chamber?: MagaChamberType,
): Promise<MagaStateHoldingsData> {
  const env = await fetchStateDetail(stateId);
  if (!env) return { contracts: [] };
  // 'state'/undefined → all chambers; a specific chamber → just that office.
  const wantOffice = chamber && chamber !== 'state' ? chamber : null;
  const contracts = env.data.groups
    .filter((g) => (wantOffice ? g.office === wantOffice : true))
    .flatMap((g) => g.contracts)
    .map(toComponentContract);
  return { contracts };
}

export async function fetchMagaStateGroupFromPmi(
  stateId: string,
  chamber: MagaChamberType,
): Promise<MagaGroup | null> {
  const env = await fetchStateDetail(stateId);
  const g = env?.data.groups.find((row) => row.office === chamber);
  return g ? rowToMagaGroup(g) : null;
}

export async function fetchMagaGroupsFromPmi(chamber: MagaChamberType): Promise<MagaGroup[]> {
  return (await fetchGroups(chamber)).map(rowToMagaGroup);
}

export async function fetchMagaQuestionsFromPmi(): Promise<MagaQuestion[]> {
  const groups = await fetchGroups();
  return groups.map((g) => ({
    // Stable numeric id: the first contributing market's id.
    peerGroupId: g.contracts[0]?.market_id ?? 0,
    baseQuestion: g.base_question,
    aggregateProbability: g.heat == null ? null : g.heat / 100,
    peerCount: g.n_markets,
    souceNames: groupSources(g),
  }));
}

export async function fetchMagaSearchCatalogFromPmi(
  q?: string,
  scope?: MagaViewType,
): Promise<MagaSearchCatalogResponse> {
  const [byState, groups] = await Promise.all([fetchByState(), fetchGroups()]);
  const needle = (q ?? '').trim().toLowerCase();
  const matchesScope = (office: string): boolean =>
    !scope || scope === 'all' || scope === 'state' || office === scope;

  const states = Object.values(byState.data.states)
    .filter((r) => !needle || r.state.toLowerCase().includes(needle))
    .map((r) => ({
      id: r.state_code,
      name: r.state,
      pmiScore: r.heat,
      activeContractsCount: r.n_markets,
      sourceNames: ['polymarket'],
    }));

  const groupRows = groups
    .filter((g) => matchesScope(g.office))
    .filter((g) => !needle || g.base_question.toLowerCase().includes(needle) || g.state.toLowerCase().includes(needle))
    .map((g) => ({
      id: `${g.state_code}-${g.office}`,
      chamber: g.office,
      stateId: g.state_code,
      stateAbbr: g.state_code,
      baseQuestion: g.base_question,
      pmiScore: g.heat,
      activeContractsCount: g.n_markets,
      sourceNames: groupSources(g),
    }));

  return { states, groups: groupRows };
}

interface PmiTrendsEnvelope {
  summary: string;
  data: { state_code: string; days: number; points: Array<{ date: string; value: number }> };
}

/** Daily per-state heat from pmi-api /maga/by-state/{code}/trends. */
export async function fetchMagaStateTrendsFromPmi(
  stateId: string,
  days = 14,
): Promise<TrendPoint[]> {
  const base = pmiApiBase();
  if (!base) throw new Error('fetchMagaStateTrendsFromPmi() called without VITE_PMI_API_URL');
  const code = encodeURIComponent(stateId.toUpperCase());
  const res = await fetch(`${base}/maga/by-state/${code}/trends?days=${days}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`pmi-api /maga/by-state/${stateId}/trends → ${res.status}`);
  const env = (await res.json()) as PmiTrendsEnvelope;
  return env.data.points.map((p) => ({ date: p.date, value: p.value }));
}
