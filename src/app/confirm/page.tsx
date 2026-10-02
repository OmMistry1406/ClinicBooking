import { loadConfig } from '@/lib/config';
import { findActiveSlotByToken } from '@/lib/supabase/admin';
import { formatSlot, isPlausibleToken, lookupAppointment } from '@/server/cancel';

export const dynamic = 'force-dynamic';

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let slot: { date: string; time: string } | null = null;
  if (isPlausibleToken(token)) {
    try {
      const config = loadConfig();
      const res = await lookupAppointment(token, {
        findActiveSlot: (t) => findActiveSlotByToken(t),
        cancel: async () => false,
      });
      if (res.found) slot = formatSlot(res.slotStart, config.clinicTz);
    } catch {
      slot = null;
    }
  }
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Your appointment has been confirmed.</h1>
      {slot && (
        <p className="mt-2">
          Date: <strong>{slot.date}</strong>
          <br />
          Time: <strong>{slot.time}</strong>
        </p>
      )}
      {slot && isPlausibleToken(token) && (
        <div className="mt-4">
          <p>Your private cancellation link (keep it private):</p>
          <a className="break-all text-blue-700 underline" href={`/cancel/${token}`}>
            {`/cancel/${token}`}
          </a>
          <p className="mt-2">
            You can cancel this appointment using the link above until {slot.time} on {slot.date}.
          </p>
        </div>
      )}
    </main>
  );
}
