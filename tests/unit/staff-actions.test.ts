import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentTable } from '@/components/AppointmentTable';
import { allowedActions } from '@/lib/appointmentActions';
import { transitionAppointment, type StaffAppointment, type TransitionDeps } from '@/server/appointments';

const cookieState = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sb-access-token' && cookieState.token ? { value: cookieState.token } : undefined),
  }),
}));

const NOW = new Date('2026-10-02T15:00:00Z');
const FUTURE = '2026-10-02T16:00:00Z';
const PAST = '2026-10-02T13:00:00Z';
const ID = '11111111-1111-4111-8111-111111111111';

function row(over: Partial<StaffAppointment> = {}): StaffAppointment {
  return { id: ID, slot_start: FUTURE, name: 'Ann', phone: '+15551234567', email: null, notes: null, status: 'pending', ...over };
}

function setup(current: StaffAppointment | null, over: Partial<TransitionDeps> = {}, patchRows?: StaffAppointment[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify(patchRows ?? [{ ...current, ...body }]), { status: 200 });
    }
    return new Response(JSON.stringify(current ? [current] : []), { status: 200 });
  }) as unknown as typeof fetch;
  const d: TransitionDeps = {
    token: 'jwt',
    isAuthenticated: async () => true,
    now: NOW,
    fetchImpl,
    supabaseUrl: 'http://db',
    anonKey: 'anon',
    ...over,
  };
  return { d, calls };
}

describe('allowedActions', () => {
  it('matches the FR-08/FR-09 matrix', () => {
    expect(allowedActions('pending', FUTURE, NOW)).toEqual(['confirm', 'cancel']);
    expect(allowedActions('pending', PAST, NOW)).toEqual(['confirm']);
    expect(allowedActions('confirmed', FUTURE, NOW)).toEqual(['cancel']);
    expect(allowedActions('confirmed', PAST, NOW)).toEqual(['no_show']);
    expect(allowedActions('cancelled', FUTURE, NOW)).toEqual([]);
    expect(allowedActions('no_show', PAST, NOW)).toEqual([]);
    expect(allowedActions('no_show', FUTURE, NOW)).toEqual([]);
  });
});

describe('transitionAppointment', () => {
  it('confirm sets status and updated_at, conditional on current status', async () => {
    const { d, calls } = setup(row());
    const res = await transitionAppointment(ID, 'confirm', d);
    expect(res).toMatchObject({ ok: true, appointment: { status: 'confirmed' } });
    const patch = calls[1]!;
    expect(patch.url).toContain(`id=eq.${ID}`);
    expect(patch.url).toContain('status=eq.pending');
    expect(JSON.parse(patch.init!.body as string)).toEqual({ status: 'confirmed', updated_at: NOW.toISOString() });
    expect(patch.init!.headers).toMatchObject({ Authorization: 'Bearer jwt', apikey: 'anon' });
  });

  it('cancel sets cancelled_by=staff', async () => {
    const { d, calls } = setup(row({ status: 'confirmed' }));
    const res = await transitionAppointment(ID, 'cancel', d);
    expect(res.ok).toBe(true);
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({
      status: 'cancelled',
      cancelled_by: 'staff',
      updated_at: NOW.toISOString(),
    });
  });

  it('no_show leaves cancelled_by untouched and only works for past confirmed', async () => {
    const ok = setup(row({ status: 'confirmed', slot_start: PAST }));
    expect(await transitionAppointment(ID, 'no_show', ok.d)).toMatchObject({ ok: true });
    expect(JSON.parse(ok.calls[1]!.init!.body as string)).toEqual({ status: 'no_show', updated_at: NOW.toISOString() });
    const bad = setup(row({ status: 'confirmed', slot_start: FUTURE }));
    expect(await transitionAppointment(ID, 'no_show', bad.d)).toMatchObject({ ok: false, status: 409 });
  });

  it('rejects disallowed transitions without writing', async () => {
    for (const [status, slot, action] of [
      ['confirmed', PAST, 'cancel'],
      ['cancelled', FUTURE, 'cancel'],
      ['no_show', PAST, 'cancel'],
      ['confirmed', FUTURE, 'confirm'],
    ] as const) {
      const { d, calls } = setup(row({ status, slot_start: slot }));
      expect(await transitionAppointment(ID, action, d)).toMatchObject({ ok: false, status: 409 });
      expect(calls.every((c) => c.init?.method !== 'PATCH')).toBe(true);
    }
  });

  it('409 when the row changed concurrently, 404 when missing, 400 on bad input', async () => {
    expect(await transitionAppointment(ID, 'confirm', setup(row(), {}, []).d)).toMatchObject({ ok: false, status: 409 });
    expect(await transitionAppointment(ID, 'confirm', setup(null).d)).toMatchObject({ ok: false, status: 404 });
    expect(await transitionAppointment('x', 'confirm', setup(row()).d)).toMatchObject({ ok: false, status: 400 });
    expect(await transitionAppointment(ID, 'delete', setup(row()).d)).toMatchObject({ ok: false, status: 400 });
  });

  it('401 without a token or with an invalid session, and never touches the DB', async () => {
    const a = setup(row(), { token: undefined });
    const b = setup(row(), { isAuthenticated: async () => false });
    expect(await transitionAppointment(ID, 'confirm', a.d)).toMatchObject({ ok: false, status: 401 });
    expect(await transitionAppointment(ID, 'confirm', b.d)).toMatchObject({ ok: false, status: 401 });
    expect(a.calls.length + b.calls.length).toBe(0);
  });

  it('maps DB 401/403 (RLS) to 401', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    const { d } = setup(row(), { fetchImpl });
    expect(await transitionAppointment(ID, 'confirm', d)).toMatchObject({ ok: false, status: 401 });
  });
});

describe('PATCH /api/staff/appointments/[id]', () => {
  beforeEach(() => {
    process.env.CLINIC_TZ = 'America/New_York';
    cookieState.token = undefined;
  });

  it('returns 401 for an unauthenticated request', async () => {
    const { PATCH } = await import('@/app/api/staff/appointments/[id]/route');
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({ action: 'confirm' }) }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(res.status).toBe(401);
  });
});

describe('AppointmentTable actions', () => {
  const html = (rows: StaffAppointment[], withActions = true) =>
    renderToStaticMarkup(
      createElement(AppointmentTable, {
        appointments: rows,
        tz: 'UTC',
        ...(withActions ? { now: NOW, onAction: () => {} } : {}),
      }),
    );

  it('shows buttons per status/time', () => {
    const pending = html([row()]);
    expect(pending).toContain('data-action="confirm"');
    expect(pending).toContain('data-action="cancel"');
    expect(pending).not.toContain('data-action="no_show"');

    const pastConfirmed = html([row({ status: 'confirmed', slot_start: PAST })]);
    expect(pastConfirmed).toContain('Mark No-Show');
    expect(pastConfirmed).not.toContain('data-action="cancel"');
    expect(pastConfirmed).not.toContain('data-action="confirm"');

    const futureConfirmed = html([row({ status: 'confirmed' })]);
    expect(futureConfirmed).toContain('data-action="cancel"');
    expect(futureConfirmed).not.toContain('data-action="no_show"');

    expect(html([row({ status: 'no_show', slot_start: PAST })])).not.toContain('<button');
    expect(html([row({ status: 'cancelled' })])).not.toContain('<button');
    expect(html([row()], false)).not.toContain('<button');
  });
});
