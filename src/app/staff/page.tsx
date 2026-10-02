import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { StaffLoginForm } from '@/components/StaffLoginForm';
import { getCurrentStaff } from '@/lib/staffSession';

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

  return (
    <main className="p-4">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <LogoutButton />
      </header>
      {/* Appointments list view is added by the staff appointments task (FR-07). */}
    </main>
  );
}
