import { describe, expect, it } from 'vitest';
import { attemptSubmit, emptyBookingForm, validateBookingForm, type BookingFormValues } from '@/lib/validation';

const valid: BookingFormValues = {
  date: '2026-11-02',
  slot: '2026-11-02T09:00:00.000Z',
  name: 'Jane',
  phone: '+1 555 123-4567',
  email: '',
  notes: '',
  consent: true,
};

describe('booking form validation', () => {
  it('accepts a valid form', () => {
    expect(validateBookingForm(valid)).toEqual({});
  });
  it('rejects empty name with a field error', () => {
    expect(validateBookingForm({ ...valid, name: '' }).name).toBeTruthy();
  });
  it('rejects name over 100 chars', () => {
    expect(validateBookingForm({ ...valid, name: 'a'.repeat(101) }).name).toBeTruthy();
  });
  it('rejects phone 123', () => {
    expect(validateBookingForm({ ...valid, phone: '123' }).phone).toBeTruthy();
  });
  it('accepts +1 555 123-4567', () => {
    expect(validateBookingForm({ ...valid, phone: '+1 555 123-4567' }).phone).toBeUndefined();
  });
  it('rejects parentheses (FR-02 allows only digits, +, spaces, dashes)', () => {
    expect(validateBookingForm({ ...valid, phone: '+1 (555) 123-4567' }).phone).toBeTruthy();
  });
  it('rejects phone over 20 chars', () => {
    expect(validateBookingForm({ ...valid, phone: '1'.repeat(21) }).phone).toBeTruthy();
  });
  it('rejects test@.com and test@', () => {
    expect(validateBookingForm({ ...valid, email: 'test@.com' }).email).toBeTruthy();
    expect(validateBookingForm({ ...valid, email: 'test@' }).email).toBeTruthy();
  });
  it('accepts test@example.co.uk and empty email', () => {
    expect(validateBookingForm({ ...valid, email: 'test@example.co.uk' }).email).toBeUndefined();
    expect(validateBookingForm({ ...valid, email: '' }).email).toBeUndefined();
  });
  it('rejects email over 254 chars and notes over 500', () => {
    expect(validateBookingForm({ ...valid, email: 'a'.repeat(250) + '@b.co' }).email).toBeTruthy();
    expect(validateBookingForm({ ...valid, notes: 'n'.repeat(501) }).notes).toBeTruthy();
  });
  it('blocks submission without consent', () => {
    const r = attemptSubmit({ ...valid, consent: false });
    expect(r.valid).toBe(false);
    expect(r.errors.consent).toBeTruthy();
  });
  it('defaults consent to unchecked', () => {
    expect(emptyBookingForm.consent).toBe(false);
  });
  it('preserves values after a validation error', () => {
    const input = { ...valid, name: '', notes: 'keep me', email: 'x@y.com' };
    const r = attemptSubmit(input);
    expect(r.valid).toBe(false);
    expect(r.values).toEqual(input);
  });
});
