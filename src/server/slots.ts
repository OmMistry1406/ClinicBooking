import type { Schedule } from '@/lib/config';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localParts(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    h: get('hour'),
    mi: get('minute'),
    s: get('second'),
  };
}

function offsetMs(utcMs: number, tz: string): number {
  const p = localParts(utcMs, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Local date string (YYYY-MM-DD) of an instant in the zone. */
export function localDate(utcMs: number, tz: string): string {
  const p = localParts(utcMs, tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Converts a clinic-local date + minutes-after-midnight to a UTC instant, or null if the wall time does not exist (DST gap). */
export function zonedToUtc(date: string, minutes: number, tz: string): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y!, m! - 1, d!, 0, minutes);
  let utc = naive - offsetMs(naive, tz);
  utc = naive - offsetMs(utc, tz);
  const back = localParts(utc, tz);
  const wanted = new Date(naive);
  if (
    back.d !== wanted.getUTCDate() ||
    back.h !== wanted.getUTCHours() ||
    back.mi !== wanted.getUTCMinutes()
  ) {
    return null;
  }
  return new Date(utc);
}

export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

export interface SlotInput {
  date: string;
  tz: string;
  schedule: Schedule;
  holidays: string[];
  now: Date;
}

/** All bookable slot starts (ISO UTC) for a clinic-local date, before subtracting bookings. */
export function generateSlots({ date, tz, schedule, holidays, now }: SlotInput): string[] {
  if (!isValidDateString(date) || holidays.includes(date)) return [];
  const today = localDate(now.getTime(), tz);
  if (date < today || date > addDays(today, schedule.windowDays)) return [];
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  if (!schedule.openWeekdays.includes(weekday)) return [];

  const out: string[] = [];
  const len = schedule.slotMinutes;
  for (let t = schedule.openMinutes; t + len <= schedule.closeMinutes; t += len) {
    // slot must not overlap lunch
    if (t < schedule.lunchEndMinutes && t + len > schedule.lunchStartMinutes) continue;
    const start = zonedToUtc(date, t, tz);
    if (!start || start.getTime() <= now.getTime()) continue;
    out.push(start.toISOString());
  }
  return out;
}

/** True when the instant is a valid slot start under the schedule (same validator as listing). */
export function isValidSlotStart(startIso: string, input: Omit<SlotInput, 'date'>): boolean {
  const ms = Date.parse(startIso);
  if (Number.isNaN(ms)) return false;
  const date = localDate(ms, input.tz);
  return generateSlots({ ...input, date }).includes(new Date(ms).toISOString());
}

export function subtractBooked(slots: string[], booked: Iterable<string>): string[] {
  const taken = new Set([...booked].map((b) => new Date(b).toISOString()));
  return slots.filter((s) => !taken.has(s));
}
