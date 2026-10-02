import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { getCurrentStaff } from '@/lib/staffSession';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentStaff();
  if (!user) redirect('/staff');

  return (
    <main className="p-4">
      <ChangePasswordForm requireCurrent={!user.mustChangePassword} />
    </main>
  );
}
