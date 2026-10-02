import { checkRateLimit } from '@/lib/ratelimit';
import { adminSetPassword, getUser, passwordGrant, signOutToken } from '@/lib/supabase/gotrue';
import type { AuthDeps } from './auth';

/** Production wiring of the auth service to Supabase. */
export function defaultAuthDeps(): AuthDeps {
  return {
    hit: (key, max, windowSeconds) => checkRateLimit(key, max, windowSeconds),
    signIn: (email, password) => passwordGrant(email, password),
    getUser: (token) => getUser(token),
    setPassword: (id, password) => adminSetPassword(id, password),
    signOut: (token) => signOutToken(token),
  };
}
