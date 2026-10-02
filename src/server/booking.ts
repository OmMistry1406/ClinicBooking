import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AppConfig } from '@/lib/config';
import { bookingSchema } from '@/lib/validation';
import { isValidSlotStart } from './slots';

export const SLOT_TAKEN_MESSAGE = 'This slot is no longer available. Please choose another.';
export const PHONE_LIMIT_MESSAGE =
  'This phone number already has the maximum of 3 active appointments. Please cancel one or call the clinic.';
export const UNAVAILABLE_MESSAGE = 'Booking temporarily unavailable. Please try again in 5 minutes.';

export interface NewAppointment {
  slot_start: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: 'pending';
  cancel_token: string;
  consent_at: string;
}

export interface BookingDeps {
  config: AppConfig;
  now: () => Date;
  insert: (
    row: NewAppointment,
  ) => Promise<{ ok: true } | { ok: false; code: 'slot_taken' | 'phone_limit' | 'unavailable' }>;
  generateToken?: () => string;
}

export type BookingResult =
  | { ok: true; cancelToken: string }
  | {
      ok: false;
      status: 400 | 409 | 503;
      error: string;
      fieldErrors?: Record<string, string>;
    };

const requestSchema = bookingSchema.extend({
  slot: z.string().min(1, 'Choose a time slot'),
  consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the privacy notice to book' }) }),
});

/** 32 random bytes, base64url. */
export function newCancelToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Validates (Zod + schedule rules per FR-04) and inserts a pending appointment. */
export async function createBooking(input: unknown, deps: BookingDeps): Promise<BookingResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, status: 400, error: 'Please correct the highlighted fields.', fieldErrors };
  }
  const data = parsed.data;

  const ms = Date.parse(data.slot);
  const now = deps.now();
  const valid =
    !Number.isNaN(ms) &&
    isValidSlotStart(new Date(ms).toISOString(), {
      tz: deps.config.clinicTz,
      schedule: deps.config.schedule,
      holidays: deps.config.holidays,
      now,
    });
  if (!valid) {
    return {
      ok: false,
      status: 400,
      error: 'That time is not available for booking. Please choose another.',
      fieldErrors: { slot: 'That time is not available for booking.' },
    };
  }

  const cancelToken = (deps.generateToken ?? newCancelToken)();
  const result = await deps.insert({
    slot_start: new Date(ms).toISOString(),
    name: data.name,
    phone: data.phone,
    email: data.email ? data.email : null,
    notes: data.notes ? data.notes : null,
    status: 'pending',
    cancel_token: cancelToken,
    consent_at: now.toISOString(),
  });
  if (result.ok) return { ok: true, cancelToken };
  if (result.code === 'slot_taken') {
    return { ok: false, status: 409, error: SLOT_TAKEN_MESSAGE, fieldErrors: { slot: SLOT_TAKEN_MESSAGE } };
  }
  if (result.code === 'phone_limit') return { ok: false, status: 400, error: PHONE_LIMIT_MESSAGE };
  return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
}
