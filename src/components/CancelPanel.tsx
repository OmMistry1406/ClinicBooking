'use client';

import { useActionState } from 'react';
import { cancelAppointmentAction, type CancelState } from '@/app/cancel/[token]/actions';
import { CANCELLED_MESSAGE, NOT_FOUND_MESSAGE } from '@/server/cancel';

const bookLink = (
  <a
    href="/book"
    className="mt-4 inline-flex min-h-[44px] items-center rounded bg-blue-700 px-4 py-2 font-medium text-white"
  >
    Book a new appointment
  </a>
);

export default function CancelPanel({ token, date, time }: { token: string; date: string; time: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelAppointmentAction, {
    status: 'idle',
  });

  if (state.status === 'cancelled') {
    return (
      <div role="status">
        <p>{CANCELLED_MESSAGE}</p>
        {bookLink}
      </div>
    );
  }
  if (state.status === 'not_found') {
    return (
      <div role="status">
        <p>{NOT_FOUND_MESSAGE}</p>
        {bookLink}
      </div>
    );
  }
  return (
    <form action={action}>
      <p>
        Your appointment: <strong>{date}</strong> at <strong>{time}</strong>
      </p>
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="mt-4 min-h-[44px] rounded bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        Cancel Appointment
      </button>
    </form>
  );
}
