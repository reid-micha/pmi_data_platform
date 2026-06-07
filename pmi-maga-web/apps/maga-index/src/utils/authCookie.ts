import Cookies from 'js-cookie';

export const WAR_INDEX_AUTH_TOKEN_COOKIE_NAME = 'war_index_auth_token';

/** Staging password tab: same cookie slot as OAuth token, value is not a JWT. */
export const STAGING_PASSWORD_GATE_COOKIE_VALUE = 'staging-shared-password';

const COOKIE_PATH = '/';
const EXPIRES_DAYS = 7;

function isHttps(): boolean {
  return typeof globalThis !== 'undefined' && globalThis.location?.protocol === 'https:';
}

/** Persists token in a cookie; expires in 7 days (JS-readable, not HttpOnly). */
export function setWarIndexAuthTokenCookie(token: string): void {
  Cookies.set(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME, token, {
    expires: EXPIRES_DAYS,
    path: COOKIE_PATH,
    sameSite: 'lax',
    secure: isHttps(),
  });
}

export function clearWarIndexAuthTokenCookie(): void {
  Cookies.remove(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME, {
    path: COOKIE_PATH,
    ...(isHttps() ? { secure: true } : {}),
  });
}

export function hasWarIndexAuthTokenCookie(): boolean {
  const v = Cookies.get(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME);
  return typeof v === 'string' && v.length > 0;
}
