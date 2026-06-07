import type { WorldData } from '@micah/types';
import { apiGet } from './client';

export async function fetchWorld(): Promise<WorldData> {
  return apiGet<WorldData>('/api/index/hourly/world');
}
