import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/lib/config';
import { generateSlots, isValidSlotStart, subtractBooked, zonedToUtc } from '@/server/slots';

const schedule = loadConfig({ CLINIC_TZ: 'UTC' }).schedule;
const now = new Date('2026-03-01T00:00:00Z');

describe('generateSlots', () => {
  it('generates 28 15-minute slots on a weekday, skipping lunch', () => {
    const s = generateSlots({ date: '2026-03-02', tz: 'UTC', schedule, holidays: [], now });
    expect(s).toHaveLength(28);
    expect(s[0]).toBe('2026-03-02T09:00:00.000Z');
    expect(s[27]).toBe('2026-03-02T16:45:00.000Z');
    expect(s.filter((x) => x < '2026-03-02T13:00').length).toBe(16);
    expect(s.filter((x) => x >= '2026-03-02T14:00').length).toBe(12);
    expect(s).toEqual([...s].sort());
    // lunch 13:00-13:59 excluded; noon/afternoon boundary
    expect(s).toContain('2026-03-02T12:45:00.000Z');
    for (const t of ['13:00', '13:15', '13:30', '13:45']) {
      expect(s).not.toContain(`2026-03-02T${t}:00.000Z`);
    }
    expect(s).toContain('2026-03-02T14:00:00.000Z');
    expect(s).not.toContain('2026-03-02T17:00:00.000Z');
  });

  it('offers zero slots on every Saturday and Sunday in the window', () => {
    let weekends = 0;
    for (let i = 0; i <= 90; i++) {
      const date = new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) {
        weekends++;
        expect(generateSlots({ date, tz: 'UTC', schedule, holidays: [], now })).toEqual([]);
      }
    }
    expect(weekends).toBeGreaterThan(20);
  });

  it('limits to today + 90 days', () => {
    const n = new Date('2026-03-03T00:00:00Z'); // +90 days = Mon 2026-06-01
    const base = { tz: 'UTC', schedule, holidays: [], now: n };
    expect(generateSlots({ ...base, date: '2026-06-01' })).toHaveLength(28);
    expect(generateSlots({ ...base, date: '2026-06-02' })).toEqual([]);
  });

  it('excludes today slots that are not after the current clinic-local time', () => {
    const base = { date: '2026-03-02', tz: 'UTC', schedule, holidays: [] };
    const s = generateSlots({ ...base, now: new Date('2026-03-02T10:15:00Z') });
    expect(s[0]).toBe('2026-03-02T10:30:00.000Z'); // 10:15 itself is not after now
    expect(s).toHaveLength(22);
    expect(generateSlots({ ...base, now: new Date('2026-03-02T17:00:00Z') })).toEqual([]);
  });

  it('rejects invalid date strings', () => {
    expect(generateSlots({ date: '2026-02-30', tz: 'UTC', schedule, holidays: [], now })).toEqual([]);
    expect(generateSlots({ date: 'nope', tz: 'UTC', schedule, holidays: [], now })).toEqual([]);
  });

  it('converts Europe/London local time to UTC (GMT and BST)', () => {
    const base = { tz: 'Europe/London', schedule, holidays: [], now };
    const winter = generateSlots({ ...base, date: '2026-03-02' });
    expect(winter).toHaveLength(28);
    expect(winter[0]).toBe('2026-03-02T09:00:00.000Z');
    const summer = generateSlots({ ...base, date: '2026-04-01' });
    expect(summer).toHaveLength(28);
    expect(summer[0]).toBe('2026-04-01T08:00:00.000Z');
    expect(summer[27]).toBe('2026-04-01T15:45:00.000Z');
  });

  it('returns nothing for weekends, holidays, past and out-of-window dates', () => {
    const base = { tz: 'UTC', schedule, now };
    expect(generateSlots({ ...base, date: '2026-03-01', holidays: [] })).toEqual([]);
    expect(generateSlots({ ...base, date: '2026-03-02', holidays: ['2026-03-02'] })).toEqual([]);
    expect(generateSlots({ ...base, date: '2026-02-27', holidays: [] })).toEqual([]);
    expect(generateSlots({ ...base, date: '2026-12-01', holidays: [] })).toEqual([]);
  });

  it('uses clinic local time across zones and DST', () => {
    const ny = generateSlots({
      date: '2026-03-09',
      tz: 'America/New_York',
      schedule,
      holidays: [],
      now,
    });
    expect(ny[0]).toBe('2026-03-09T13:00:00.000Z'); // EDT after the 8 Mar change
    const winter = generateSlots({
      date: '2026-03-02',
      tz: 'America/New_York',
      schedule,
      holidays: [],
      now,
    });
    expect(winter[0]).toBe('2026-03-02T14:00:00.000Z'); // EST
    const syd = generateSlots({
      date: '2026-03-02',
      tz: 'Australia/Sydney',
      schedule,
      holidays: [],
      now,
    });
    expect(syd[0]).toBe('2026-03-01T22:00:00.000Z'); // AEDT +11
  });

  it('applies "today" cut-off and holidays in the clinic zone, not UTC', () => {
    // 2026-04-01 22:30 UTC is already 23:30 BST on 1 Apr; at 23:30 UTC on 31 Mar it is 00:30 BST on 1 Apr.
    const base = { date: '2026-04-01', tz: 'Europe/London', schedule, holidays: [] };
    const s = generateSlots({ ...base, now: new Date('2026-04-01T08:00:00Z') }); // 09:00 BST
    expect(s[0]).toBe('2026-04-01T08:15:00.000Z');
    expect(s).toHaveLength(27);
    expect(generateSlots({ ...base, holidays: ['2026-04-01'], now })).toEqual([]);
    // weekend in London
    expect(generateSlots({ ...base, date: '2026-04-04', now })).toEqual([]);
    expect(generateSlots({ ...base, date: '2026-04-05', now })).toEqual([]);
  });

  it('excludes holidays from slot validation', () => {
    const input = { tz: 'UTC', schedule, holidays: ['2026-03-02'], now };
    expect(isValidSlotStart('2026-03-02T09:00:00Z', input)).toBe(false);
    expect(isValidSlotStart('2026-03-03T09:00:00Z', input)).toBe(true);
  });

  it('detects nonexistent DST-gap times', () => {
    expect(zonedToUtc('2026-03-08', 150, 'America/New_York')).toBeNull();
  });
});

describe('slot validation and booking subtraction', () => {
  it('validates slot starts', () => {
    const input = { tz: 'UTC', schedule, holidays: [], now };
    expect(isValidSlotStart('2026-03-02T09:00:00Z', input)).toBe(true);
    expect(isValidSlotStart('2026-03-02T09:10:00Z', input)).toBe(false);
    expect(isValidSlotStart('garbage', input)).toBe(false);
    expect(isValidSlotStart('2026-03-02T13:00:00Z', input)).toBe(false); // lunch
    expect(isValidSlotStart('2026-03-07T09:00:00Z', input)).toBe(false); // Saturday
    const london = { ...input, tz: 'Europe/London' };
    expect(isValidSlotStart('2026-04-01T08:00:00Z', london)).toBe(true); // 09:00 BST
    expect(isValidSlotStart('2026-04-01T09:00:00Z', london)).toBe(true); // 10:00 BST
    expect(isValidSlotStart('2026-04-01T16:00:00Z', london)).toBe(false); // 17:00 BST
  });

  it('removes booked slots', () => {
    expect(subtractBooked(['2026-03-02T09:00:00.000Z', '2026-03-02T09:30:00.000Z'], ['2026-03-02T09:00:00+00:00'])).toEqual([
      '2026-03-02T09:30:00.000Z',
    ]);
  });
});
