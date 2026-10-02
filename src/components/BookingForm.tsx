'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SLOW_MESSAGE, submitBooking } from '@/lib/submitBooking';
import { TurnstileWidget } from './TurnstileWidget';
import {
  attemptSubmit,
  emptyBookingForm,
  type BookingFormErrors,
  type BookingFormValues,
} from '@/lib/validation';
import { PrivacyNotice } from './PrivacyNotice';
import { SlotPicker } from './SlotPicker';

interface Props {
  timeZone: string;
}

const inputClass = 'mt-1 min-h-11 w-full rounded border border-gray-400 px-3 py-2';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}

export function BookingForm({ timeZone }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BookingFormValues>(emptyBookingForm);
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [slotsRefresh, setSlotsRefresh] = useState(0);

  function set<K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    const result = attemptSubmit(values);
    setErrors(result.errors); // values stay in state, so they persist on errors
    if (!result.valid) return;
    if (!captcha) {
      setFormError('Please complete the CAPTCHA check.');
      return;
    }

    setSubmitting(true);
    setSlow(false);
    const outcome = await submitBooking(result.values, captcha, { onSlow: () => setSlow(true) });
    if (outcome.kind === 'success') {
      router.push(`/confirm?token=${encodeURIComponent(outcome.cancelToken)}`);
      return; // keep the loading state while navigating
    }
    setSubmitting(false);
    setSlow(false);
    setCaptcha('');
    setCaptchaReset((n) => n + 1);
    if (outcome.kind === 'slot_taken') {
      setValues((v) => ({ ...v, slot: '' }));
      setErrors({ slot: outcome.message });
      setSlotsRefresh((n) => n + 1);
      return;
    }
    setErrors(outcome.fieldErrors);
    setFormError(outcome.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
      <div>
        <label htmlFor="date" className="block text-sm font-medium">
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          value={values.date}
          onChange={(e) => setValues((v) => ({ ...v, date: e.target.value, slot: '' }))}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'date-error' : undefined}
          className={inputClass}
        />
        <FieldError id="date-error" message={errors.date} />
      </div>

      <SlotPicker
        date={values.date}
        value={values.slot}
        timeZone={timeZone}
        onChange={(s) => set('slot', s)}
        error={errors.slot}
        refreshKey={slotsRefresh}
      />

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={100}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={inputClass}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={values.phone}
          onChange={(e) => set('phone', e.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          className={inputClass}
        />
        <FieldError id="phone-error" message={errors.phone} />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email (optional)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={inputClass}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? 'notes-error' : undefined}
          className={inputClass}
        />
        <FieldError id="notes-error" message={errors.notes} />
      </div>

      <PrivacyNotice />

      <div>
        <label htmlFor="consent" className="flex min-h-11 items-start gap-2 text-sm">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            checked={values.consent}
            onChange={(e) => set('consent', e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? 'consent-error' : undefined}
            className="mt-1 h-5 w-5"
          />
          <span>I have read the privacy notice and consent to my data being stored.</span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>

      <TurnstileWidget onToken={setCaptcha} resetKey={captchaReset} />

      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      {slow && (
        <p role="status" className="text-sm text-gray-700">
          {SLOW_MESSAGE}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 w-full rounded bg-blue-700 px-4 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        Book appointment
      </button>
    </form>
  );
}
