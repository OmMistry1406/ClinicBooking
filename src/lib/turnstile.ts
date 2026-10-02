export type TurnstileResult = 'ok' | 'failed' | 'unavailable';

const DUMMY_PASS_SECRET = '1x0000000000000000000000000000000AA';
const DUMMY_TOKENS = /^(1x0+AA|XXXX\.DUMMY\.TOKEN\.XXXX)$/;
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
  // Cloudflare's documented dummy "always passes" secret is for offline dev/test only: verify
  // locally (dummy tokens only) so no network round-trip is needed.
  if (!options.fetchImpl && secret === DUMMY_PASS_SECRET) {
    return DUMMY_TOKENS.test(token) ? 'ok' : 'failed';
  }
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
