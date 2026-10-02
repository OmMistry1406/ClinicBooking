import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/lib/config';
import { generateSlots, isValidSlotStart, subtractBooked, zonedToUtc } from '@/server/slots';

const schedule = loadConfig({ CLINIC_TZ: 'UTC' }).schedule;
const now = new Date('2026-03-01T00:00:00Z');

describe('generateSlots', () => {
  it('generates 30-min slots skipping lunch', () => {
    const s = generateSlots({ date: '2026-03-02', tz: 'UTC', schedule, holidays: [], now });
    expect(s[0]).toBe('2026-03-02T09:00:00.000Z');
    expect(s).toHaveLength(14);
    expect(s).not.toContain('2026-03-02T12:00:00.000Z');
    expect(s).not.toContain('2026-03-02T12:30:00.000Z');
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
  });

  it('removes booked slots', () => {
    expect(subtractBooked(['2026-03-02T09:00:00.000Z', '2026-03-02T09:30:00.000Z'], ['2026-03-02T09:00:00+00:00'])).toEqual([
      '2026-03-02T09:30:00.000Z',
    ]);
  });
});
