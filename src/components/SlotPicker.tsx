'use client';

import { useEffect, useState } from 'react';

export interface SlotOption {
  /** ISO UTC start instant. */
  start: string;
}

interface Props {
  date: string;
  value: string;
  timeZone: string;
  onChange: (slot: string) => void;
  error?: string;
  /** Increment to force a reload of the slot list (e.g. after a slot collision). */
  refreshKey?: number;
}

/** Loads available slots for a date from GET /api/slots and shows times in clinic local time. */
export function SlotPicker({ date, value, timeZone, onChange, error, refreshKey = 0 }: Props) {
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!date) {
      setSlots([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    setStatus('loading');
    fetch(`/api/slots?date=${encodeURIComponent(date)}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('bad status');
        const body = (await res.json()) as { slots?: Array<string | SlotOption> };
        const list = (body.slots ?? []).map((s) => (typeof s === 'string' ? { start: s } : s));
        setSlots(list);
        setStatus('idle');
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') setStatus('error');
      });
    return () => ctrl.abort();
  }, [date, refreshKey]);

  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });

  return (
    <div>
      <label htmlFor="slot" className="block text-sm font-medium">
        Time ({timeZone})
      </label>
      <select
        id="slot"
        name="slot"
        value={value}
        disabled={!date || status === 'loading'}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'slot-error' : undefined}
        className="mt-1 min-h-11 w-full rounded border border-gray-400 px-3 disabled:bg-gray-100"
      >
        <option value="">
          {!date
            ? 'Pick a date first'
            : status === 'loading'
              ? 'Loading…'
              : slots.length === 0
                ? 'No slots available'
                : 'Select a time'}
        </option>
        {slots.map((s) => (
          <option key={s.start} value={s.start}>
            {fmt.format(new Date(s.start))}
          </option>
        ))}
      </select>
      {status === 'error' && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          Could not load slots. Please try again.
        </p>
      )}
      {error && (
        <p id="slot-error" role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
