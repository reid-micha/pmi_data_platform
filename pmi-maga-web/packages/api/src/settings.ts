import { apiGet } from './client';
import { fetchSettingsFromPmi, isPmiBacked } from './pmi_backend';

export interface AppSettings {
  future_phrase: string;
}

export async function fetchSettings(): Promise<AppSettings> {
  if (isPmiBacked()) return fetchSettingsFromPmi();
  return apiGet<AppSettings>('/api/settings');
}
