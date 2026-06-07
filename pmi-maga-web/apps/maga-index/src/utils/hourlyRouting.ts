import { useSearchParams } from 'react-router-dom';

export function parseHourlyParam(value: string | null): boolean {
  return value === 'true';
}

export function useHourlyParam(): boolean {
  const [searchParams] = useSearchParams();
  return parseHourlyParam(searchParams.get('hourly'));
}

export function withHourlyParam(path: string, hourly: boolean): string {
  const [beforeHash, hash = ''] = path.split('#');
  const [pathname, query = ''] = beforeHash.split('?');
  const params = new URLSearchParams(query);
  if (hourly) {
    params.set('hourly', 'true');
  } else {
    params.delete('hourly');
  }

  const queryString = params.toString();
  return `${pathname}${queryString ? `?${queryString}` : ''}${hash ? `#${hash}` : ''}`;
}
