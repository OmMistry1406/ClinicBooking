import { describe, expect, it, vi } from 'vitest';
import { cancelByToken, formatSlot, lookupAppointment, type CancelDeps } from '@/server/cancel';
import { newCancelToken } from '@/server/booking';
import { cancelAppointmentByToken, findActiveSlotByToken } from '@/lib/supabase/admin';

const TOKEN = newCancelToken();

function deps(over: Partial<CancelDeps> = {}): CancelDeps {
  return { findActiveSlot: vi.fn(async () => '2026-10-05T07:30:00.000Z'), cancel: vi.fn(async () => true), ...over };
}

describe('cancel service', () => {
  it('generates tokens with >=128 bits of randomness', () => {
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newCancelToken()).not.toBe(TOKEN);
  });

  it('returns only slotStart for a valid token (no PII)', async () => {
    const res = await lookupAppointment(TOKEN, deps());
    expect(res).toEqual({ found: true, slotStart: '2026-10-05T07:30:00.000Z' });
  });

  it('treats malformed tokens as not found without querying', async () => {
    const d = deps();
    expect(await lookupAppointment('bad token!', d)).toEqual({ found: false });
    expect(await lookupAppointment(undefined, d)).toEqual({ found: false });
    expect(d.findActiveSlot).not.toHaveBeenCalled();
  });

  it('treats unknown token and lookup errors identically', async () => {
    expect(await lookupAppointment(TOKEN, deps({ findActiveSlot: async () => null }))).toEqual({ found: false });
    expect(
      await lookupAppointment(TOKEN, deps({ findActiveSlot: async () => { throw new Error('x'); } })),
    ).toEqual({ found: false });
  });

  it('cancel passes current time and reports already-cancelled as failure', async () => {
    const d = deps({ now: () => new Date('2026-10-02T10:00:00Z') });
    expect(await cancelByToken(TOKEN, d)).toEqual({ ok: true });
    expect(d.cancel).toHaveBeenCalledWith(TOKEN, '2026-10-02T10:00:00.000Z');
    expect(await cancelByToken(TOKEN, deps({ cancel: async () => false }))).toEqual({ ok: false });
  });

  it('formats in clinic time zone', () => {
    const f = formatSlot('2026-10-05T07:30:00.000Z', 'Asia/Kolkata');
    expect(f.time).toBe('13:00');
    expect(f.date).toContain('5 October 2026');
  });
});

describe('admin cancellation queries', () => {
  process.env.SUPABASE_URL = 'http://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';

  it('selects only slot_start and excludes cancelled', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ slot_start: 'S' }]), { status: 200 }));
    expect(await findActiveSlotByToken(TOKEN, f as unknown as typeof fetch)).toBe('S');
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('select=slot_start&');
    expect(url).toContain('status=neq.cancelled');
    expect(url).not.toMatch(/name|phone|email|notes/);
  });

  it('PATCH sets cancelled_by patient, status and updated_at', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ id: '1' }]), { status: 200 }));
    expect(await cancelAppointmentByToken(TOKEN, '2026-10-02T10:00:00.000Z', f as unknown as typeof fetch)).toBe(true);
    const init = (f.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      status: 'cancelled',
      cancelled_by: 'patient',
      updated_at: '2026-10-02T10:00:00.000Z',
    });
    const none = vi.fn(async () => new Response('[]', { status: 200 }));
    expect(await cancelAppointmentByToken(TOKEN, 'x', none as unknown as typeof fetch)).toBe(false);
  });
});
