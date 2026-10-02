import CancelPanel from '@/components/CancelPanel';
import { loadConfig } from '@/lib/config';
import { findActiveSlotByToken } from '@/lib/supabase/admin';
import { formatSlot, lookupAppointment, NOT_FOUND_MESSAGE } from '@/server/cancel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cancel appointment', robots: { index: false, follow: false } };

export default async function CancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let found: { date: string; time: string } | null = null;
  try {
    const config = loadConfig();
    const res = await lookupAppointment(token, { findActiveSlot: (t) => findActiveSlotByToken(t), cancel: async () => false });
    if (res.found) found = formatSlot(res.slotStart, config.clinicTz);
  } catch {
    found = null;
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Cancel appointment</h1>
      <div className="mt-4">
        {found ? (
          <CancelPanel token={token} date={found.date} time={found.time} />
        ) : (
          <>
            <p>{NOT_FOUND_MESSAGE}</p>
            <a
              href="/book"
              className="mt-4 inline-flex min-h-[44px] items-center rounded bg-blue-700 px-4 py-2 font-medium text-white"
            >
              Book a new appointment
            </a>
          </>
        )}
      </div>
    </main>
  );
}
