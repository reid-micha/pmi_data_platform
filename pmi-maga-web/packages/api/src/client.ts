import Cookies from 'js-cookie';
import {
  type ApiRequestContext,
  runApiErrorMiddlewares,
  runApiRequestMiddlewares,
  runApiResponseMiddlewares,
} from './middleware';

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  'https://api.thewarindex.org';
const TOKEN_STORAGE_KEY = 'auth_token';
type ApiRequestOptions = Omit<RequestInit, 'method' | 'body'>;
type QueryValue = string | number | boolean | null | undefined;

export function setAuthToken(token: string): void {
  // Persist auth token in a cookie for 24 hours.
  Cookies.set(TOKEN_STORAGE_KEY, token, {
    expires: 1,
    path: '/',
    sameSite: 'lax',
    secure: window.location.protocol === 'https:',
  });
}

export function getAuthToken(): string | null {
  return Cookies.get(TOKEN_STORAGE_KEY) ?? null;
}

export function clearAuthToken(): void {
  Cookies.remove(TOKEN_STORAGE_KEY, { path: '/' });
}

/**
 * Internal transport primitive used by apiGet/apiPost.
 * Flow:
 * 1) build request context (url + RequestInit)
 * 2) apply default auth/json headers
 * 3) run request middleware pipeline (can mutate url/init)
 * 4) execute fetch
 * 5) run response middleware pipeline
 * 6) normalize non-2xx as Error and pass through error middleware
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Shared mutable context passed through middleware stages.
  const requestContext: ApiRequestContext = {
    url: `${API_BASE}${path}`,
    init: { ...options },
  };

  const token = getAuthToken();
  const headers = new Headers(requestContext.init.headers);
  // Auto-attach bearer token unless caller already set Authorization.
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Default JSON content type for POST when not explicitly provided.
  if (requestContext.init.method === 'POST' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  requestContext.init.headers = headers;

  // Allow request middleware to mutate URL/init before fetch.
  const finalContext = await runApiRequestMiddlewares(requestContext);

  try {
    const response = await fetch(finalContext.url, finalContext.init);
    // Allow response middleware to inspect/transform response globally.
    const finalResponse = await runApiResponseMiddlewares(response, finalContext);

    if (!finalResponse.ok) {
      const data = await finalResponse.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(data.error || `Request failed: ${finalResponse.status}`);
    }

    return finalResponse.json();
  } catch (error) {
    // Give error middleware one place to normalize/log/redirect.
    const nextError = await runApiErrorMiddlewares(error, finalContext);
    throw nextError;
  }
}

function buildQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function apiGet<TResponse>(
  path: string,
  query?: Record<string, QueryValue>,
  options?: ApiRequestOptions
): Promise<TResponse> {
  // Keep apiGet strict: always GET; query object is serialized here.
  return apiFetch<TResponse>(`${path}${buildQueryString(query)}`, {
    ...options,
    method: 'GET',
  });
}

export function apiPost<TResponse, TRequest = unknown>(
  path: string,
  request?: TRequest,
  options?: ApiRequestOptions
): Promise<TResponse> {
  // Keep apiPost strict: request model is serialized to JSON here.
  return apiFetch<TResponse>(path, {
    ...options,
    method: 'POST',
    body: request === undefined ? undefined : JSON.stringify(request),
  });
}

export function apiPut<TResponse, TRequest = unknown>(
  path: string,
  request?: TRequest,
  options?: ApiRequestOptions
): Promise<TResponse> {
  return apiFetch<TResponse>(path, {
    ...options,
    method: 'PUT',
    body: request === undefined ? undefined : JSON.stringify(request),
  });
}
