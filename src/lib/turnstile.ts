export type TurnstileResult = 'ok' | 'failed' | 'unavailable';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Server-side Turnstile verification. Fails closed: any problem reaching Cloudflare is 'unavailable'. */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | undefined,
  options: { secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileResult> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return 'unavailable';
  if (!token) return 'failed';
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body: form, cache: 'no-store' });
    if (!res.ok) return 'unavailable';
    const body = (await res.json()) as { success?: boolean };
    return body.success === true ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}
