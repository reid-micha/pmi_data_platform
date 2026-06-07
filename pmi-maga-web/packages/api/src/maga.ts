import type {
  ComponentContract,
  MagaIndexData,
  MagaLastUpdatedResponse,
  MagaQuestion,
  MagaSearchCatalogResponse,
  MagaState,
  MagaStateDetail,
  MagaStateHoldingsData,
  TrendPoint,
} from '@micah/types';
import { apiGet } from './client';
import {
  isPmiBacked,
  fetchMagaIndexFromPmi,
  fetchMagaStatesFromPmi,
  fetchMagaStateFromPmi,
  fetchMagaStateHoldingsFromPmi,
  fetchMagaStateGroupFromPmi,
  fetchMagaGroupsFromPmi,
  fetchMagaQuestionsFromPmi,
  fetchMagaSearchCatalogFromPmi,
  fetchMagaStateTrendsFromPmi,
} from './pmi_backend';

export type MagaViewType = 'all' | 'house' | 'state' | 'senate' | 'governor';

/** search-catalog API uses `states`; other MAGA endpoints use `state`. */
function magaViewToSearchCatalogScope(view: MagaViewType): 'all' | 'states' | 'governor' | 'senate' | 'house' {
  return view === 'state' ? 'states' : view;
}

export async function fetchMagaLastUpdated(): Promise<MagaLastUpdatedResponse> {
  return apiGet<MagaLastUpdatedResponse>('/api/maga/index/last-updated');
}

export async function fetchMagaIndex(view: MagaViewType = 'state'): Promise<MagaIndexData> {
  // Opt-in: serve the national index from the pmi platform when VITE_PMI_API_URL
  // is set; otherwise the legacy war-index endpoint (1:1 default).
  if (isPmiBacked()) return fetchMagaIndexFromPmi(view);
  return apiGet<MagaIndexData>(`/api/maga/index/us?view=${view}`);
}

export async function fetchMagaStates(view: MagaViewType = 'state'): Promise<MagaState[]> {
  if (isPmiBacked()) return fetchMagaStatesFromPmi(view);
  return apiGet<MagaState[]>(`/api/maga/index/states?view=${view}`);
}

export async function fetchMagaQuestions(): Promise<MagaQuestion[]> {
  if (isPmiBacked()) return fetchMagaQuestionsFromPmi();
  const res = await apiGet<{ value: MagaQuestion[]; Count: number } | MagaQuestion[]>('/api/maga/index/question');
  if (Array.isArray(res)) return res;
  return (res as { value: MagaQuestion[] }).value ?? [];
}

export interface FetchMagaSearchCatalogParams {
  q?: string;
  scope?: MagaViewType;
}

export async function fetchMagaSearchCatalog(
  params: FetchMagaSearchCatalogParams = {},
): Promise<MagaSearchCatalogResponse> {
  const q = params.q?.trim();
  const scope = params.scope ?? 'all';
  if (isPmiBacked()) return fetchMagaSearchCatalogFromPmi(q, scope);
  return apiGet<MagaSearchCatalogResponse>('/api/maga/index/search-catalog', {
    q: q ? q : undefined,
    scope: magaViewToSearchCatalogScope(scope),
  });
}

export async function fetchMagaState(stateId: string, view: MagaViewType = 'state'): Promise<MagaStateDetail> {
  if (isPmiBacked()) return fetchMagaStateFromPmi(stateId);
  return apiGet<MagaStateDetail>(`/api/maga/index/state/${stateId}?view=${view}`);
}

export async function fetchMagaStateTrends(stateId: string, view: MagaViewType = 'state', days = 14, district?: number): Promise<TrendPoint[]> {
  if (isPmiBacked()) return fetchMagaStateTrendsFromPmi(stateId, days);
  const districtParam = district != null ? `&district=${district}` : '';
  const res = await apiGet<{ trendData: TrendPoint[] } | TrendPoint[]>(`/api/maga/index/state/${stateId}/trends?days=${days}&view=${view}${districtParam}`);
  if (Array.isArray(res)) return res;
  return (res as { trendData: TrendPoint[] }).trendData ?? [];
}

export type MagaChamberType = 'house' | 'state' | 'senate' | 'governor';

export async function fetchMagaStateHoldings(stateId: string, chamber?: MagaChamberType, districtId?: string): Promise<MagaStateHoldingsData> {
  if (isPmiBacked()) return fetchMagaStateHoldingsFromPmi(stateId, chamber);
  const params = new URLSearchParams();
  if (chamber) params.append('chamber', chamber);
  if (districtId) params.append('district', districtId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiGet<
    MagaStateHoldingsData | MagaStateHoldingsData[] | ComponentContract[] | { value: ComponentContract[] }
  >(`/api/maga/index/state/${stateId}/holdings${query}`);

  if (Array.isArray(res) && res.length > 0 && 'contracts' in (res[0] as object)) {
    return { contracts: ((res[0] as MagaStateHoldingsData).contracts) ?? [] };
  }
  if (Array.isArray(res)) return { contracts: res as ComponentContract[] };
  if ('value' in (res as object)) return { contracts: (res as { value: ComponentContract[] }).value ?? [] };
  return res as MagaStateHoldingsData;
}

export interface MagaGroup {
  id: string;
  chamber: MagaChamberType;
  stateId: string;
  stateAbbr: string;
  district: number | null;
  baseQuestion: string;
  pmiScore: number | null;
  activeContractsCount: number;
  sourceNames: string[];
  contracts?: ComponentContract[];
}

export async function fetchMagaGroups(chamber: MagaChamberType): Promise<MagaGroup[]> {
  if (isPmiBacked()) return fetchMagaGroupsFromPmi(chamber);
  return apiGet<MagaGroup[]>(`/api/maga/index/groups?chamber=${chamber}`);
}

export async function fetchMagaStateGroup(stateId: string, chamber: 'senate' | 'governor'): Promise<MagaGroup> {
  if (isPmiBacked()) {
    const group = await fetchMagaStateGroupFromPmi(stateId, chamber);
    if (!group) throw new Error(`No ${chamber} group for state ${stateId}`);
    return group;
  }
  return apiGet<MagaGroup>(`/api/maga/index/state/${stateId}/group/${chamber}`);
}

/**
 * Single house district group (`GET /api/maga/index/state/{stateId}/district/{districtId}`).
 *
 * **Currently unused in maga-index.** Question detail uses `fetchMagaState(stateId, 'state')`
 * and selects from `groups`; holdings use `fetchMagaStateHoldings(..., districtId)`.
 * Use this only when you need one district without loading full state detail.
 */
export async function fetchMagaDistrict(stateId: string, districtId: string | number): Promise<MagaGroup> {
  return apiGet<MagaGroup>(`/api/maga/index/state/${stateId}/district/${districtId}`);
}

