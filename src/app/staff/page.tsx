import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { StaffLoginForm } from '@/components/StaffLoginForm';
import { StaffList } from '@/components/StaffList';
import { loadConfig } from '@/lib/config';
import { getCurrentStaff } from '@/lib/staffSession';
import { allowedDateRange } from '@/server/appointments';
import { fetchStaffAppointments } from '@/server/staffAppointmentsApi';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const user = await getCurrentStaff();

  // Unauthenticated: only the login form, no appointment data is fetched or rendered.
  if (!user) {
    return (
      <main className="p-4">
        <StaffLoginForm />
      </main>
    );
  }
  if (user.mustChangePassword) redirect('/staff/change-password');

  const tz = loadConfig().clinicTz;
  const range = allowedDateRange(new Date(), tz);
  const result = await fetchStaffAppointments(range.today);

  return (
    <main className="p-4">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <LogoutButton />
      </header>
      {result.ok ? (
        <StaffList tz={tz} today={range.today} min={range.min} max={range.max} initialAppointments={result.appointments} />
      ) : (
        <p role="alert" className="text-red-700">
          Could not load appointments. Please reload.
        </p>
      )}
    </main>
  );
}
