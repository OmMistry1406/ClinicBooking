import type { NextResponse } from 'next/server';
import type { AuthTokens } from './supabase/gotrue';

export const ACCESS_COOKIE = 'sb-access-token';
export const REFRESH_COOKIE = 'sb-refresh-token';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const base = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

type CookieJar = Pick<NextResponse['cookies'], 'set'>;

export function writeSessionCookies(jar: CookieJar, tokens: AuthTokens): void {
  jar.set(ACCESS_COOKIE, tokens.accessToken, { ...base(), maxAge: SESSION_MAX_AGE_SECONDS });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, { ...base(), maxAge: SESSION_MAX_AGE_SECONDS });
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.set(ACCESS_COOKIE, '', { ...base(), maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...base(), maxAge: 0 });
}

/** Reads the exp claim (seconds) of a JWT without verifying it - only used to decide when to refresh. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/** Paths that must never exist: public sign-up is disabled (FR-06). */
export function isSignupPath(pathname: string): boolean {
  return /^\/(api\/)?(auth|staff)?\/?(sign-?up|register)(\/|$)/i.test(pathname) || /\/auth\/v1\/signup/i.test(pathname);
}
