import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/ratelimit';
import { insertAppointment } from '@/lib/supabase/admin';
import { verifyTurnstile } from '@/lib/turnstile';
import { createBooking, UNAVAILABLE_MESSAGE } from '@/server/booking';

export const dynamic = 'force-dynamic';

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request.headers.get('x-real-ip') || 'unknown';
}

function fail(status: number, error: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json({ error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const json: unknown = await request.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('bad body');
    body = json as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid request.');
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    console.error('Invalid configuration');
    return fail(503, UNAVAILABLE_MESSAGE);
  }

  const ip = clientIp(request);
  const { captchaToken, ...form } = body;

  const captcha = await verifyTurnstile(typeof captchaToken === 'string' ? captchaToken : undefined, ip);
  if (captcha === 'failed') return fail(403, 'CAPTCHA verification failed. Please try again.');
  if (captcha === 'unavailable') return fail(503, UNAVAILABLE_MESSAGE);

  try {
    const allowed = await checkRateLimit(`book:ip:${ip}`, 5, 600);
    if (!allowed) return fail(429, 'Too many booking attempts. Please try again later.');
  } catch (e) {
    if (e instanceof RateLimitUnavailableError) return fail(503, UNAVAILABLE_MESSAGE);
    throw e;
  }

  const result = await createBooking(form, {
    config,
    now: () => new Date(),
    insert: (row) => insertAppointment(row),
  });
  if (!result.ok) return fail(result.status, result.error, result.fieldErrors);
  return NextResponse.json(
    { cancelToken: result.cancelToken, cancelUrl: `/cancel/${result.cancelToken}` },
    { status: 201 },
  );
}
