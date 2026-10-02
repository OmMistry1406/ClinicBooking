import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, clearSessionCookies } from '@/lib/session';
import { logoutStaff } from '@/server/auth';
import { defaultAuthDeps } from '@/server/authDeps';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await logoutStaff(request.cookies.get(ACCESS_COOKIE)?.value, defaultAuthDeps());
  const res = NextResponse.json({ redirect: '/staff' });
  clearSessionCookies(res.cookies);
  return res;
}
