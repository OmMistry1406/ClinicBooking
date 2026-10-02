import { z } from 'zod';

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  CLINIC_TZ: z
    .string({ required_error: 'CLINIC_TZ is required' })
    .min(1, 'CLINIC_TZ is required')
    .refine(isValidTimeZone, 'CLINIC_TZ must be a valid IANA time zone'),
  HOLIDAYS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .refine(
      (list) => list.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      'HOLIDAYS must be comma-separated YYYY-MM-DD dates',
    ),
});

export interface Schedule {
  /** Minutes after local midnight. */
  openMinutes: number;
  closeMinutes: number;
  lunchStartMinutes: number;
  lunchEndMinutes: number;
  slotMinutes: number;
  /** Bookable days ahead of today (clinic local). */
  windowDays: number;
  /** 0 = Sunday ... 6 = Saturday. */
  openWeekdays: number[];
}

export interface AppConfig {
  clinicTz: string;
  holidays: string[];
  schedule: Schedule;
}

function parseHm(value: string | undefined, fallback: string, name: string): number {
  const v = (value ?? '').trim() || fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw new Error(`${name} must be HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseIntEnv(value: string | undefined, fallback: number, name: string): number {
  const v = (value ?? '').trim();
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function parseSchedule(env: Record<string, string | undefined>): Schedule {
  const days = (env.OPEN_WEEKDAYS ?? '1,2,3,4,5')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return {
    openMinutes: parseHm(env.OPEN_TIME, '09:00', 'OPEN_TIME'),
    closeMinutes: parseHm(env.CLOSE_TIME, '17:00', 'CLOSE_TIME'),
    lunchStartMinutes: parseHm(env.LUNCH_START, '13:00', 'LUNCH_START'),
    lunchEndMinutes: parseHm(env.LUNCH_END, '14:00', 'LUNCH_END'),
    slotMinutes: parseIntEnv(env.SLOT_MINUTES, 15, 'SLOT_MINUTES'),
    windowDays: parseIntEnv(env.BOOKING_WINDOW_DAYS, 90, 'BOOKING_WINDOW_DAYS'),
    openWeekdays: days,
  };
}

/** Parses and validates env. Throws (never defaults silently) on a missing/invalid CLINIC_TZ. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse({ CLINIC_TZ: env.CLINIC_TZ, HOLIDAYS: env.HOLIDAYS });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return {
    clinicTz: parsed.data.CLINIC_TZ,
    holidays: parsed.data.HOLIDAYS,
    schedule: parseSchedule(env),
  };
}
