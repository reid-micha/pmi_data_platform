import type { SearchResponse } from '@micah/types';
import { apiGet } from './client';

export async function fetchSearch(query: string, limit?: number): Promise<SearchResponse> {
  return apiGet<SearchResponse>('/api/search', { q: query, limit });
}
