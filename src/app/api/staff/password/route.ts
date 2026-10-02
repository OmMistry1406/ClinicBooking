import { NextResponse, type NextRequest } from 'next/server';
import { readJsonObject } from '@/lib/http';
import { ACCESS_COOKIE, writeSessionCookies } from '@/lib/session';
import { changeStaffPassword } from '@/server/auth';
import { defaultAuthDeps } from '@/server/authDeps';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const result = await changeStaffPassword(
    {
      accessToken: request.cookies.get(ACCESS_COOKIE)?.value,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      repeatPassword: body.repeatPassword,
    },
    defaultAuthDeps(),
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) },
      { status: result.status },
    );
  }
  const res = NextResponse.json({ redirect: '/staff' });
  writeSessionCookies(res.cookies, result.tokens);
  return res;
}
