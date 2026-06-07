import type { ContractDetailData, ContractListResponse } from '@micah/types';
import { apiGet } from './client';

export interface ContractFilters {
  limit?: number;
  offset?: number;
  search?: string;
  source?: string;
}

export async function fetchContracts(
  filters?: ContractFilters,
): Promise<ContractListResponse> {
  const query = {
    limit: filters?.limit,
    offset: filters?.offset,
    search: filters?.search,
    source: filters?.source,
  };
  return apiGet<ContractListResponse>('/api/contracts/hourly', query);
}

export async function fetchContractDetail(
  contractId: number,
): Promise<ContractDetailData> {
  return apiGet<ContractDetailData>(`/api/contracts/hourly/${contractId}`);
}

export async function fetchLastUpdatedContractPrice(): Promise<{ recordedAt: string }> {
  return apiGet<{ recordedAt: string }>('/api/contracts/hourly/last-updated');
}

