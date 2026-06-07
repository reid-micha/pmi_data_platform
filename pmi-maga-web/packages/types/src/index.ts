// Shared API response types used by both war-index and main-site

// ---------------------------------------------------------------------------
// Admin prompt editor
// ---------------------------------------------------------------------------

export interface PromptRecord {
  content: string;
  model: string | null;
  temperature: number | null;
  top_p: number | null;
  reasoning_effort: string | null;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface ComponentContract {
  title: string;
  website: string;
  yesPercent: number;
  volume: number | null;
  url: string | null;
  directLink: number | null;
}

// ---------------------------------------------------------------------------
// /api/index/world
// ---------------------------------------------------------------------------

export interface RegionRef {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
}

export interface WorldData {
  pmiScore: number;
  componentExchanges: number;
  sourceNames?: string[];
  activeContractsCount?: number | null;
  holdingsCount?: number | null;
  trendData: TrendPoint[];
  regions: RegionRef[];
}

// ---------------------------------------------------------------------------
// /api/maga/index/us — MAGA Index with US states
// ---------------------------------------------------------------------------

export interface MagaState {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
}

export interface MagaIndexData {
  pmiScore: number | null;
  sourceNames?: string[];
  activeContractsCount?: number | null;
  holdingsCount?: number | null;
  trendData: TrendPoint[];
  states: MagaState[];
}

export interface MagaLastUpdatedResponse {
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// /api/maga/index/state/{id} — MAGA state detail
// ---------------------------------------------------------------------------

export interface MagaStateDetail {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  holdingsCount?: number | null;
  sourceNames?: string[];
  componentExchanges?: number;
  trendData: TrendPoint[];
  groups?: Array<{
    id: string;
    chamber: string;
    district: number | null;
    pmiScore: number | null;
    activeContractsCount?: number;
    stateAbbr?: string;
    baseQuestion?: string;
    sourceNames?: string[];
  }>;
}

export interface MagaStateHoldingsData {
  contracts: ComponentContract[];
}

// ---------------------------------------------------------------------------
// /api/maga/index/question — MAGA questions
// ---------------------------------------------------------------------------

export interface MagaQuestion {
  peerGroupId: number;
  baseQuestion: string;
  aggregateProbability: number | null;
  peerCount: number;
  souceNames?: string[]; // note: API typo preserved
}

// ---------------------------------------------------------------------------
// /api/maga/index/search-catalog — MAGA search index
// ---------------------------------------------------------------------------

export interface MagaSearchCatalogState {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
}

export interface MagaSearchCatalogGroup {
  id: string;
  chamber: string;
  stateId: string;
  stateAbbr: string;
  baseQuestion: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
}

export interface MagaSearchCatalogResponse {
  states: MagaSearchCatalogState[];
  groups: MagaSearchCatalogGroup[];
}

// ---------------------------------------------------------------------------
// /api/index/region (list) — with nested countries
// ---------------------------------------------------------------------------

export interface Country {
  id: string;
  name: string;
  pmiScore: number | null;
  regionId: string | null;
  regionName: string | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
}

export interface Region {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
  countries: Country[];
}

// ---------------------------------------------------------------------------
// /api/index/region/{id} — detail (includes trend, contracts, stats)
// ---------------------------------------------------------------------------

export interface CountryInRegion {
  id: string;
  name: string;
  pmiScore: number | null;
  activeContractsCount?: number | null;
  sourceNames?: string[];
}

export interface RegionDetail {
  id: string;
  name: string;
  pmiScore: number | null;
  componentExchanges: number;
  sourceNames?: string[];
  activeContractsCount?: number | null;
  holdingsCount?: number | null;
  countries: CountryInRegion[];
  trendData: TrendPoint[];
}

// ---------------------------------------------------------------------------
// /api/index/country/{id} — detail (merged: trend + contracts + stats)
// ---------------------------------------------------------------------------

export interface CountryDetail {
  id: string;
  name: string;
  pmiScore: number | null;
  regionId: string | null;
  regionName: string | null;
  componentExchanges: number;
  sourceNames?: string[];
  activeContractsCount?: number | null;
  holdingsCount?: number | null;
  trendData: TrendPoint[];
}

// ---------------------------------------------------------------------------
// /api/index/{country|region}/{id}/holdings — lazy-loaded contracts
// ---------------------------------------------------------------------------

export interface HoldingsData {
  contracts: ComponentContract[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Market {
  external_id: string;
  title: string;
  source: string;
  probability: number;
  tags?: string[];
  volume?: number;
}

// --- Types for the war-index dashboard ---

export interface WorldMarker {
  id: number;
  slug: string;
  top: string;
  left: string;
  mobileTop: string;
  mobileLeft: string;
  number: string;
  title: string;
  description: string;
  tags: string[];
  hotspotColor: string;
  mapImage: string;
  /** Country ID for enrichment with live PMI data. */
  countryId?: string;
}

export type TabType = 'all' | 'regions' | 'countries' | 'questions' | 'states' | 'governor' | 'senate' | 'house';

export interface WorldConflictIndexProps {
  markers: WorldMarker[];
  activeMarker: WorldMarker | null;
  setActiveMarker: (marker: WorldMarker | null) => void;
  popupRef: { current: HTMLDivElement | null };
  onMarkerClick?: (marker: WorldMarker) => void;
  countries: Country[];
  magaView: import('@micah/api').MagaViewType;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

// --- Contract types (public endpoints) ---

export interface ContractListItem {
  id: number;
  externalId: string;
  source: string;
  title: string;
  probability: number;
  volume: number | null;
  closeDate: string | null;
  url: string | null;
}

export interface ContractListResponse {
  contracts: ContractListItem[];
  totalCount: number;
  hasMore: boolean;
}

// --- Search types ---

export interface SearchRegionItem {
  id: string;
  name: string;
  pmiScore: number | null;
}

export interface SearchCountryItem {
  id: string;
  name: string;
  regionId: string | null;
  pmiScore: number | null;
}

export interface SearchContractItem {
  id: number;
  title: string;
  source: string;
  probability: number | null;
  url: string | null;
}

export interface SearchResponse {
  regions: SearchRegionItem[];
  countries: SearchCountryItem[];
  contracts: SearchContractItem[];
}

export interface ContractDetailData {
  id: number;
  externalId: string;
  source: string;
  title: string;
  probability: number;
  volume: number | null;
  closeDate: string | null;
  url: string | null;
  priceHistory: TrendPoint[];
}

// ---------------------------------------------------------------------------
// /api/index/question — anchor questions (peer-grouped)
// ---------------------------------------------------------------------------

export interface AnchorPeerContract {
  title: string;
  source: string;
  probability: number | null;
  volume: number | null;
  url: string | null;
  similarityScore: number;
}

export interface AnchorQuestion {
  peerGroupId: number;
  baseQuestion: string;
  aggregateProbability: number | null;
  peerCount: number;
  sourceCount: number;
  peers: AnchorPeerContract[];
  trendData?: TrendPoint[];
}
