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

export interface AppConfig {
  clinicTz: string;
  holidays: string[];
}

/** Parses and validates env. Throws (never defaults silently) on a missing/invalid CLINIC_TZ. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse({ CLINIC_TZ: env.CLINIC_TZ, HOLIDAYS: env.HOLIDAYS });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return { clinicTz: parsed.data.CLINIC_TZ, holidays: parsed.data.HOLIDAYS };
}
