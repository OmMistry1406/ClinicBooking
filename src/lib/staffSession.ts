import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from './session';
import { getUser, type AuthUser } from './supabase/gotrue';

/** Returns the authenticated staff user for the current request (validated with Supabase), or null. */
export async function getCurrentStaff(): Promise<AuthUser | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await getUser(token);
  } catch {
    return null;
  }
}
