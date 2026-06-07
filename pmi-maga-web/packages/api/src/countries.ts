import type { Country, CountryDetail, HoldingsData } from '@micah/types';
import { apiGet } from './client';

export type { CountryDetail } from '@micah/types';

export async function fetchCountries(): Promise<Country[]> {
  const countries = await apiGet<Country[]>('/api/index/hourly/country');
  return countries.filter((c: Country) => c.pmiScore != null);
}

export async function fetchCountry(countryId: string): Promise<CountryDetail> {
  return apiGet<CountryDetail>(`/api/index/hourly/country/${countryId}`);
}

export async function fetchCountryHoldings(countryId: string): Promise<HoldingsData> {
  return apiGet<HoldingsData>(`/api/index/hourly/country/${countryId}/holdings`);
}
