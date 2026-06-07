import { apiGet } from './client';

export interface AppSettings {
  future_phrase: string;
}

export async function fetchSettings(): Promise<AppSettings> {
  return apiGet<AppSettings>('/api/settings');
}
