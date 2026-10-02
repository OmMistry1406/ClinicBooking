import { BookingForm } from '@/components/BookingForm';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function BookPage() {
  const { clinicTz } = loadConfig();
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Book an appointment</h1>
      <BookingForm timeZone={clinicTz} />
    </main>
  );
}
