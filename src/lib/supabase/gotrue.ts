/**
 * Minimal Supabase Auth (GoTrue) REST client built on fetch (no extra dependencies).
 * Server-side only (also safe on the edge runtime for middleware refresh).
 */
import { adminHeaders, adminUrl } from './admin';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  /** app_metadata.must_change_password set by the developer (see scripts/create-staff.mjs). */
  mustChangePassword: boolean;
}

function apiKey(): string {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Supabase is not configured');
  return key;
}

function publicHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: apiKey(), 'Content-Type': 'application/json', ...extra };
}

function toTokens(body: unknown): AuthTokens | null {
  const b = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof b?.access_token !== 'string' || typeof b.refresh_token !== 'string') return null;
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresIn: typeof b.expires_in === 'number' ? b.expires_in : 3600,
  };
}

async function tokenGrant(
  grant: 'password' | 'refresh_token',
  payload: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<AuthTokens | null> {
  const res = await fetchImpl(adminUrl(`/auth/v1/token?grant_type=${grant}`), {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  // 400/401/422 => bad credentials or token; anything else is an outage.
  if (res.status === 400 || res.status === 401 || res.status === 422) return null;
  if (!res.ok) throw new Error(`auth status ${res.status}`);
  return toTokens(await res.json());
}

/** signInWithPassword equivalent. Null = invalid credentials. Throws on outage. */
export function passwordGrant(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthTokens | null> {
  return tokenGrant('password', { email, password }, fetchImpl);
}

export function refreshSession(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthTokens | null> {
  return tokenGrant('refresh_token', { refresh_token: refreshToken }, fetchImpl);
}

/** Validates the access token with Supabase. Null when invalid/expired. */
export async function getUser(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthUser | null> {
  const res = await fetchImpl(adminUrl('/auth/v1/user'), {
    headers: publicHeaders({ Authorization: `Bearer ${accessToken}` }),
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`auth status ${res.status}`);
  const u = (await res.json()) as {
    id?: string;
    email?: string;
    app_metadata?: { must_change_password?: unknown };
  };
  if (!u.id || !u.email) return null;
  return { id: u.id, email: u.email, mustChangePassword: u.app_metadata?.must_change_password === true };
}

/** Sets a new password and clears the must_change_password flag (service role). */
export async function adminSetPassword(
  userId: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(adminUrl(`/auth/v1/admin/users/${encodeURIComponent(userId)}`), {
    method: 'PUT',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, app_metadata: { must_change_password: false } }),
    cache: 'no-store',
  });
  return res.ok;
}

/** Revokes the session server-side (best effort). */
export async function signOutToken(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(adminUrl('/auth/v1/logout'), {
    method: 'POST',
    headers: publicHeaders({ Authorization: `Bearer ${accessToken}` }),
    cache: 'no-store',
  });
}
