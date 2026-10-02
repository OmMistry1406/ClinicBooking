import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '@/lib/config';
import { generateSlots } from '@/server/slots';

const state = vi.hoisted(() => ({
  captcha: 'ok' as 'ok' | 'failed' | 'unavailable',
  allowed: true,
  limiterDown: false,
  inserted: [] as Array<Record<string, unknown>>,
  insertResult: { ok: true } as { ok: boolean; code?: string },
}));

vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: async () => state.captcha }));
vi.mock('@/lib/ratelimit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    RateLimitUnavailableError,
    checkRateLimit: async () => {
      if (state.limiterDown) throw new RateLimitUnavailableError('down');
      return state.allowed;
    },
  };
});
vi.mock('@/lib/supabase/admin', () => ({
  insertAppointment: async (row: Record<string, unknown>) => {
    if (state.insertResult.ok) state.inserted.push(row);
    return state.insertResult;
  },
}));

import { POST } from '@/app/api/appointments/route';

function validSlot(): string {
  const cfg = loadConfig({ CLINIC_TZ: 'UTC' });
  for (let i = 1; i < 20; i++) {
    const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const s = generateSlots({ date: d, tz: 'UTC', schedule: cfg.schedule, holidays: [], now: new Date() });
    if (s.length) return s[0]!;
  }
  throw new Error('no slot');
}

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const good = () => ({
  slot: validSlot(),
  name: 'Ann',
  phone: '1234567',
  email: '',
  notes: '',
  consent: true,
  captchaToken: 'tok',
});

beforeEach(() => {
  process.env.CLINIC_TZ = 'UTC';
  process.env.HOLIDAYS = '';
  state.captcha = 'ok';
  state.allowed = true;
  state.limiterDown = false;
  state.inserted = [];
  state.insertResult = { ok: true };
});

describe('POST /api/appointments', () => {
  it('creates a pending appointment (201)', async () => {
    const res = await post(good());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cancelToken).toBeTruthy();
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ status: 'pending', cancel_token: body.cancelToken });
  });

  it('403 on failed captcha, 503 when captcha unreachable', async () => {
    state.captcha = 'failed';
    expect((await post(good())).status).toBe(403);
    state.captcha = 'unavailable';
    expect((await post(good())).status).toBe(503);
    expect(state.inserted).toHaveLength(0);
  });

  it('429 when rate limited, 503 when limiter fails', async () => {
    state.allowed = false;
    expect((await post(good())).status).toBe(429);
    state.limiterDown = true;
    expect((await post(good())).status).toBe(503);
    expect(state.inserted).toHaveLength(0);
  });

  it('400 for malformed JSON and crafted slot', async () => {
    expect((await post('{nope')).status).toBe(400);
    const res = await post({ ...good(), slot: '2020-01-04T10:00:00Z' });
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it('409 on slot collision', async () => {
    state.insertResult = { ok: false, code: 'slot_taken' };
    const res = await post(good());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This slot is no longer available. Please choose another.');
  });

  it('503 when the database is unavailable', async () => {
    state.insertResult = { ok: false, code: 'unavailable' };
    const res = await post(good());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('Booking temporarily unavailable. Please try again in 5 minutes.');
  });
});
