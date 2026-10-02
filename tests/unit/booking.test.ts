import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/lib/config';
import {
  createBooking,
  SLOT_TAKEN_MESSAGE,
  UNAVAILABLE_MESSAGE,
  type BookingDeps,
  type NewAppointment,
} from '@/server/booking';
import { generateSlots } from '@/server/slots';

const NOW = new Date('2026-10-05T00:00:00Z'); // Monday
const config = loadConfig({ CLINIC_TZ: 'UTC', HOLIDAYS: '2026-10-08' });

function fakeDb() {
  const rows: NewAppointment[] = [];
  const insert: BookingDeps['insert'] = async (row) => {
    // emulates the partial unique index on slot_start for active rows
    if (rows.some((r) => r.slot_start === row.slot_start)) return { ok: false, code: 'slot_taken' };
    rows.push(row);
    return { ok: true };
  };
  return { rows, insert };
}

function deps(insert: BookingDeps['insert'], cfg = config): BookingDeps {
  return { config: cfg, now: () => NOW, insert };
}

const slotsFor = (date: string, cfg = config) =>
  generateSlots({
    date,
    tz: cfg.clinicTz,
    schedule: cfg.schedule,
    holidays: cfg.holidays,
    now: NOW,
  });

function body(slot: string, extra: Record<string, unknown> = {}) {
  return { slot, name: 'Ann', phone: '+44 7700 900123', email: '', notes: '', consent: true, ...extra };
}

describe('slot list', () => {
  it('has 28 slots on a normal weekday', () => {
    expect(slotsFor('2026-10-06')).toHaveLength(28);
  });
});

describe('createBooking', () => {
  it('creates a pending appointment with a cancel token', async () => {
    const db = fakeDb();
    const slot = slotsFor('2026-10-06')[0]!;
    const res = await createBooking(body(slot), deps(db.insert));
    expect(res.ok).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ status: 'pending', email: null, notes: null, slot_start: slot });
    expect(db.rows[0]!.cancel_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns field errors and creates nothing for invalid fields', async () => {
    const db = fakeDb();
    const slot = slotsFor('2026-10-06')[0]!;
    const res = await createBooking(body(slot, { name: '', phone: '', email: 'test@.com' }), deps(db.insert));
    expect(res).toMatchObject({ ok: false, status: 400 });
    if (!res.ok) expect(Object.keys(res.fieldErrors!)).toEqual(expect.arrayContaining(['name', 'phone', 'email']));
    expect(db.rows).toHaveLength(0);
  });

  it('requires consent', async () => {
    const db = fakeDb();
    const slot = slotsFor('2026-10-06')[0]!;
    const res = await createBooking(body(slot, { consent: false }), deps(db.insert));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.rows).toHaveLength(0);
  });

  it.each([
    ['Saturday', '2026-10-10T10:00:00Z'],
    ['Sunday', '2026-10-11T10:00:00Z'],
    ['lunch hour', '2026-10-06T13:00:00Z'],
    ['lunch hour 13:45', '2026-10-06T13:45:00Z'],
    ['holiday', '2026-10-08T10:00:00Z'],
    ['unaligned time', '2026-10-06T10:07:00Z'],
    ['past time', '2026-10-04T10:00:00Z'],
    ['after closing', '2026-10-06T17:00:00Z'],
    ['before opening', '2026-10-06T08:45:00Z'],
    ['beyond 90 days', '2027-03-01T10:00:00Z'],
    ['garbage', 'not-a-date'],
  ])('rejects %s with 400 and creates no record', async (_n, slot) => {
    const db = fakeDb();
    const res = await createBooking(body(slot), deps(db.insert));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.rows).toHaveLength(0);
  });

  it('applies rules in the clinic zone, not UTC', async () => {
    const ny = loadConfig({ CLINIC_TZ: 'America/New_York' });
    const db = fakeDb();
    // 09:00 EDT == 13:00Z on 2026-10-06 -> accepted
    expect((await createBooking(body('2026-10-06T13:00:00Z'), deps(db.insert, ny))).ok).toBe(true);
    // 09:00Z == 05:00 local -> rejected
    expect(await createBooking(body('2026-10-06T09:00:00Z'), deps(db.insert, ny))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(db.rows).toHaveLength(1);
  });

  it('concurrent submissions for one slot give exactly one success and one collision', async () => {
    const db = fakeDb();
    const slot = slotsFor('2026-10-06')[3]!;
    const [a, b] = await Promise.all([
      createBooking(body(slot), deps(db.insert)),
      createBooking(body(slot, { name: 'Bob' }), deps(db.insert)),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser).toMatchObject({ status: 409, error: SLOT_TAKEN_MESSAGE });
    expect(db.rows).toHaveLength(1);
  });

  it('maps database unavailability to 503', async () => {
    const slot = slotsFor('2026-10-06')[0]!;
    const res = await createBooking(body(slot), deps(async () => ({ ok: false, code: 'unavailable' })));
    expect(res).toMatchObject({ ok: false, status: 503, error: UNAVAILABLE_MESSAGE });
  });
});
