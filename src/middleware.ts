import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  isSignupPath,
  jwtExpiry,
  writeSessionCookies,
} from '@/lib/session';
import { refreshSession } from '@/lib/supabase/gotrue';

/**
 * - Public sign-up routes always 404 (FR-06).
 * - Keeps the staff session alive across reloads by refreshing an expired access token.
 *   Authorization itself is always checked server-side against Supabase (getUser), never from this cookie alone.
 */
export async function middleware(request: NextRequest) {
  if (isSignupPath(request.nextUrl.pathname)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const exp = access ? jwtExpiry(access) : null;
  const stale = !access || exp === null || exp * 1000 < Date.now() + 30_000;

  if (refresh && stale) {
    try {
      const tokens = await refreshSession(refresh);
      if (tokens) {
        request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
        request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);
        const res = NextResponse.next({ request: { headers: request.headers } });
        writeSessionCookies(res.cookies, tokens);
        return res;
      }
      const res = NextResponse.next();
      clearSessionCookies(res.cookies);
      return res;
    } catch {
      // Auth outage: leave cookies untouched; pages will treat the user as logged out for this request.
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/staff/:path*', '/api/staff/:path*', '/auth/:path*', '/api/auth/:path*', '/signup', '/register'],
};
