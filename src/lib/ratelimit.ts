import { adminHeaders, adminUrl } from './supabase/admin';

export class RateLimitUnavailableError extends Error {}

/**
 * DB-backed fixed-window limiter (hit_rate_limit SQL function, service role).
 * Returns true when the request is allowed. Throws RateLimitUnavailableError when the store fails (caller -> 503).
 */
export async function checkRateLimit(
  key: string,
  max = 5,
  windowSeconds = 600,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(adminUrl('/rest/v1/rpc/hit_rate_limit'), {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const rows = (await res.json()) as Array<{ allowed: boolean }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('bad response');
    return row.allowed;
  } catch {
    throw new RateLimitUnavailableError('Rate limiter unavailable');
  }
}
