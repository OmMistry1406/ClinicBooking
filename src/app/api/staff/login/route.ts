import { NextResponse } from 'next/server';
import { readJsonObject } from '@/lib/http';
import { writeSessionCookies } from '@/lib/session';
import { loginStaff } from '@/server/auth';
import { defaultAuthDeps } from '@/server/authDeps';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const result = await loginStaff({ email: body.email, password: body.password }, defaultAuthDeps());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const res = NextResponse.json({
    redirect: result.mustChangePassword ? '/staff/change-password' : '/staff',
  });
  writeSessionCookies(res.cookies, result.tokens);
  return res;
}
