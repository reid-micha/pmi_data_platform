import type { HoldingsData, Region, RegionDetail } from '@micah/types';
import { apiGet } from './client';

export async function fetchRegions(): Promise<Region[]> {
  const regions = await apiGet<Region[]>('/api/index/hourly/region');
  return regions.filter((c: Region) => c.pmiScore != null);
}
export async function fetchRegion(regionId: string): Promise<RegionDetail> {
  return apiGet<RegionDetail>(`/api/index/hourly/region/${regionId}`);
}

export async function fetchRegionHoldings(regionId: string): Promise<HoldingsData> {
  return apiGet<HoldingsData>(`/api/index/hourly/region/${regionId}/holdings`);
}
