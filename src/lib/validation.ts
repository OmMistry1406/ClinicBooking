import { z } from 'zod';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Staff password policy (also set in Supabase Auth settings). 72 = bcrypt byte limit. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 72;

export const bookingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone is required')
    .min(7, 'Phone must be at least 7 characters')
    .max(20, 'Phone must be at most 20 characters')
    .regex(/^[0-9+\s-]+$/, 'Phone may only contain digits, +, spaces and dashes'),
  email: z
    .string()
    .trim()
    .max(254, 'Email must be at most 254 characters')
    .refine((v) => v === '' || EMAIL_REGEX.test(v), 'Enter a valid email address')
    .optional(),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export interface BookingFormValues {
  date: string;
  slot: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  consent: boolean;
}

export type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>;

export const emptyBookingForm: BookingFormValues = {
  date: '',
  slot: '',
  name: '',
  phone: '',
  email: '',
  notes: '',
  consent: false,
};

/** Validates the whole form. Returns field-level errors (empty object when valid). */
export function validateBookingForm(values: BookingFormValues): BookingFormErrors {
  const errors: BookingFormErrors = {};
  if (!values.date) errors.date = 'Choose a date';
  if (!values.slot) errors.slot = 'Choose a time slot';

  const parsed = bookingSchema.safeParse({
    name: values.name,
    phone: values.phone,
    email: values.email,
    notes: values.notes,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof BookingFormValues;
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  if (!values.consent) errors.consent = 'You must accept the privacy notice to book';
  return errors;
}

export interface FormState {
  values: BookingFormValues;
  errors: BookingFormErrors;
  /** True only when validation passed and the form may be handed to a submit handler (T-06). */
  valid: boolean;
}

/** Pure submit attempt: values are always preserved, errors reported per field. */
export function attemptSubmit(values: BookingFormValues): FormState {
  const errors = validateBookingForm(values);
  return { values, errors, valid: Object.keys(errors).length === 0 };
}
