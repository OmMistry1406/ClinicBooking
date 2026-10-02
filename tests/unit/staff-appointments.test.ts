import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentTable } from '@/components/AppointmentTable';
import { formatClinicTime, telHref } from '@/lib/format';
import {
  allowedDateRange,
  listAppointmentsForDate,
  type ListDeps,
  type StaffAppointment,
} from '@/server/appointments';

const cookieState = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sb-access-token' && cookieState.token ? { value: cookieState.token } : undefined),
  }),
}));

const TZ = 'America/New_York';
const NOW = new Date('2026-10-02T15:00:00Z'); // 11:00 local, 2026-10-02

function row(over: Partial<StaffAppointment>): StaffAppointment {
  return {
    id: '1',
    slot_start: '2026-10-02T13:00:00Z',
    name: 'Ann',
    phone: '+15551234567',
    email: null,
    notes: null,
    status: 'pending',
    ...over,
  };
}

function deps(rows: StaffAppointment[], over: Partial<ListDeps> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as unknown as typeof fetch;
  const d: ListDeps = {
    token: 'jwt',
    isAuthenticated: async () => true,
    now: NOW,
    tz: TZ,
    fetchImpl,
    supabaseUrl: 'http://db',
    anonKey: 'anon',
    ...over,
  };
  return { d, calls };
}

describe('listAppointmentsForDate', () => {
  it('defaults/queries the clinic-local day bounds, ordered by slot_start, with the user JWT (RLS)', async () => {
    const { d, calls } = deps([
      row({ id: 'b', slot_start: '2026-10-02T15:00:00Z' }),
      row({ id: 'a', slot_start: '2026-10-02T13:00:00Z' }),
    ]);
    const res = await listAppointmentsForDate(allowedDateRange(NOW, TZ).today, d);
    expect(res.ok && res.appointments.map((a) => a.id)).toEqual(['a', 'b']);
    const url = decodeURIComponent(calls[0]!.url);
    expect(url).toContain('slot_start=gte.2026-10-02T04:00:00.000Z');
    expect(url).toContain('slot_start=lt.2026-10-03T04:00:00.000Z');
    expect(url).toContain('order=slot_start.asc');
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer jwt', apikey: 'anon' });
  });

  it('fetches a past date', async () => {
    const { d, calls } = deps([]);
    const res = await listAppointmentsForDate('2026-09-01', d);
    expect(res).toEqual({ ok: true, date: '2026-09-01', appointments: [] });
    expect(decodeURIComponent(calls[0]!.url)).toContain('gte.2026-09-01T04:00:00.000Z');
  });

  it('rejects unauthenticated callers with 401 and never queries', async () => {
    const a = deps([], { token: undefined });
    expect(await listAppointmentsForDate('2026-10-02', a.d)).toMatchObject({ ok: false, status: 401 });
    const b = deps([], { isAuthenticated: async () => false });
    expect(await listAppointmentsForDate('2026-10-02', b.d)).toMatchObject({ ok: false, status: 401 });
    expect(a.calls.length + b.calls.length).toBe(0);
  });

  it('enforces the date range: 365 days back to +90 days', async () => {
    const { min, max } = allowedDateRange(NOW, TZ);
    expect(min).toBe('2025-10-02');
    expect(max).toBe('2026-12-31');
    const { d } = deps([]);
    expect(await listAppointmentsForDate(min, d)).toMatchObject({ ok: true });
    expect(await listAppointmentsForDate(max, d)).toMatchObject({ ok: true });
    expect(await listAppointmentsForDate('2025-10-01', d)).toMatchObject({ ok: false, status: 400 });
    expect(await listAppointmentsForDate('2027-01-01', d)).toMatchObject({ ok: false, status: 400 });
    expect(await listAppointmentsForDate('nope', d)).toMatchObject({ ok: false, status: 400 });
  });

  it('503 when the database errors', async () => {
    const { d } = deps([], { fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch });
    expect(await listAppointmentsForDate('2026-10-02', d)).toMatchObject({ ok: false, status: 503 });
  });
});

describe('GET /api/staff/appointments', () => {
  beforeEach(() => {
    process.env.CLINIC_TZ = TZ;
    cookieState.token = undefined;
  });

  it('returns 401 without a session', async () => {
    const { GET } = await import('@/app/api/staff/appointments/route');
    const res = await GET(new Request('http://x/api/staff/appointments?date=2026-10-02'));
    expect(res.status).toBe(401);
  });
});

describe('formatting', () => {
  it('formats time in clinic local time and builds tel links', () => {
    expect(formatClinicTime('2026-10-02T13:00:00Z', TZ)).toBe('09:00');
    expect(formatClinicTime('2026-10-02T13:00:00Z', 'UTC')).toBe('13:00');
    expect(telHref('+1 (555) 123-4567')).toBe('tel:+15551234567');
  });
});

describe('AppointmentTable', () => {
  const html = (rows: StaffAppointment[]) =>
    renderToStaticMarkup(createElement(AppointmentTable, { appointments: rows, tz: TZ }));

  it('shows an empty-day message', () => {
    expect(html([])).toContain('No appointments.');
  });

  it('renders tel link, time, status badge, notes; email only if provided', () => {
    const without = html([row({ notes: 'bring card' })]);
    expect(without).toContain('href="tel:+15551234567"');
    expect(without).toContain('09:00');
    expect(without).toContain('data-status="pending"');
    expect(without).toContain('bring card');
    expect(without).not.toContain('Email');

    const withEmail = html([row({ email: 'a@b.co', status: 'no_show' })]);
    expect(withEmail).toContain('Email');
    expect(withEmail).toContain('a@b.co');
    expect(withEmail).toContain('data-status="no_show"');
  });
});
