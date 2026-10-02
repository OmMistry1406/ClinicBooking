import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitBooking } from '@/lib/submitBooking';
import type { BookingFormValues } from '@/lib/validation';

const values: BookingFormValues = {
  date: '2026-10-06',
  slot: '2026-10-06T09:00:00.000Z',
  name: 'Ann',
  phone: '1234567',
  email: '',
  notes: '',
  consent: true,
};

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.useRealTimers());

describe('submitBooking', () => {
  it('shows the slow indicator only after 3 seconds', async () => {
    vi.useFakeTimers();
    const onSlow = vi.fn();
    const fetchImpl = vi.fn(
      () => new Promise<Response>((r) => setTimeout(() => r(new Response('{"cancelToken":"abc"}', { status: 201 })), 4000)),
    );
    const p = submitBooking(values, 'tok', { fetchImpl: fetchImpl as unknown as typeof fetch, onSlow });
    await vi.advanceTimersByTimeAsync(2999);
    expect(onSlow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onSlow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ kind: 'success', cancelToken: 'abc' });
  });

  it('does not show the indicator for fast responses', async () => {
    vi.useFakeTimers();
    const onSlow = vi.fn();
    const fetchImpl = (() => json(201, { cancelToken: 'abc' })) as unknown as typeof fetch;
    await submitBooking(values, 'tok', { fetchImpl, onSlow });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('reports a slot collision on 409', async () => {
    const fetchImpl = (() =>
      json(409, { error: 'This slot is no longer available. Please choose another.' })) as unknown as typeof fetch;
    expect(await submitBooking(values, 'tok', { fetchImpl })).toEqual({
      kind: 'slot_taken',
      message: 'This slot is no longer available. Please choose another.',
    });
  });

  it('maps 400 field errors, 403 and 503', async () => {
    const f400 = (() => json(400, { error: 'bad', fieldErrors: { phone: 'Phone is required' } })) as unknown as typeof fetch;
    expect(await submitBooking(values, 't', { fetchImpl: f400 })).toMatchObject({
      kind: 'error',
      status: 400,
      fieldErrors: { phone: 'Phone is required' },
    });
    const f403 = (() => json(403, { error: 'CAPTCHA verification failed. Please try again.' })) as unknown as typeof fetch;
    expect(await submitBooking(values, 't', { fetchImpl: f403 })).toMatchObject({ status: 403 });
    const f503 = (() => json(503, {})) as unknown as typeof fetch;
    expect(await submitBooking(values, 't', { fetchImpl: f503 })).toMatchObject({
      status: 503,
      message: 'Booking temporarily unavailable. Please try again in 5 minutes.',
    });
    const fnet = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await submitBooking(values, 't', { fetchImpl: fnet })).toMatchObject({ status: 503 });
  });
});
