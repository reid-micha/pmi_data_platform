export function isStagingEnvEnabled(): boolean {
  return import.meta.env.VITE_IS_STAGING === 'true';
}

/** Trailing slashes are stripped. Prefer VITE_API_BASE when set (e.g. OAuth), else VITE_API_URL. */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL;
  return String(raw).replace(/\/+$/, '');
}
