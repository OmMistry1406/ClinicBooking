import type { AuthTokens, AuthUser } from '@/lib/supabase/gotrue';
import { EMAIL_REGEX, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/validation';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
export const LOCKOUT_MESSAGE = 'Account locked after too many failed attempts. Please try again in 10 minutes.';
export const UNAVAILABLE_MESSAGE = 'Service temporarily unavailable. Please try again later.';
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 600;

export interface AuthDeps {
  /** Records a hit; resolves true while under the limit. May throw when the store is down. */
  hit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  signIn(email: string, password: string): Promise<AuthTokens | null>;
  getUser(accessToken: string): Promise<AuthUser | null>;
  /** Sets the password and clears must_change_password. */
  setPassword(userId: string, password: string): Promise<boolean>;
  signOut(accessToken: string): Promise<void>;
}

export type LoginResult =
  | { ok: true; tokens: AuthTokens; mustChangePassword: boolean }
  | { ok: false; status: 400 | 401 | 429 | 503; error: string };

/**
 * Login with DB-backed lockout (ADR-4): the 6th attempt for an email inside the 10 minute
 * window is refused with 429 before Supabase is contacted. The error for bad credentials is
 * deliberately identical whichever field was wrong.
 */
export async function loginStaff(input: { email: unknown; password: unknown }, deps: AuthDeps): Promise<LoginResult> {
  if (typeof input.email !== 'string' || typeof input.password !== 'string') {
    return { ok: false, status: 400, error: 'Email and password are required.' };
  }
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !password) return { ok: false, status: 400, error: 'Email and password are required.' };

  try {
    const allowed = await deps.hit(`login:${email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!allowed) return { ok: false, status: 429, error: LOCKOUT_MESSAGE };
  } catch {
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
  }

  const invalid: LoginResult = { ok: false, status: 401, error: INVALID_CREDENTIALS_MESSAGE };
  // Backend password policy: anything shorter than 12 chars can never be valid.
  if (!EMAIL_REGEX.test(email) || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return invalid;
  }

  try {
    const tokens = await deps.signIn(email, password);
    if (!tokens) return invalid;
    const user = await deps.getUser(tokens.accessToken);
    if (!user) return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
    return { ok: true, tokens, mustChangePassword: user.mustChangePassword };
  } catch {
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
  }
}

export interface ChangePasswordInput {
  accessToken: string | undefined;
  currentPassword?: unknown;
  newPassword: unknown;
  repeatPassword: unknown;
}

export type ChangePasswordResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; status: 400 | 401 | 429 | 503; error: string; fieldErrors?: Record<string, string> };

/**
 * Changes the staff password. The current password is NOT required while the
 * must_change_password flag is set (first login) and IS required afterwards.
 */
export async function changeStaffPassword(input: ChangePasswordInput, deps: AuthDeps): Promise<ChangePasswordResult> {
  if (!input.accessToken) return { ok: false, status: 401, error: 'Please log in.' };

  let user: AuthUser | null;
  try {
    user = await deps.getUser(input.accessToken);
  } catch {
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
  }
  if (!user) return { ok: false, status: 401, error: 'Please log in.' };

  const fieldErrors: Record<string, string> = {};
  const next = input.newPassword;
  if (typeof next !== 'string' || next.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (next.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.newPassword = `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (!fieldErrors.newPassword && next !== input.repeatPassword) {
    fieldErrors.repeatPassword = 'Passwords do not match';
  }
  const current = input.currentPassword;
  if (!user.mustChangePassword && (typeof current !== 'string' || current === '')) {
    fieldErrors.currentPassword = 'Current password is required';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, status: 400, error: 'Please correct the highlighted fields.', fieldErrors };
  }
  const newPassword = next as string;

  try {
    if (!user.mustChangePassword) {
      // Guard the current-password check against brute force.
      const allowed = await deps.hit(`pwchange:${user.id}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
      if (!allowed) return { ok: false, status: 429, error: LOCKOUT_MESSAGE };
      const verified = await deps.signIn(user.email, current as string);
      if (!verified) {
        return {
          ok: false,
          status: 400,
          error: 'Please correct the highlighted fields.',
          fieldErrors: { currentPassword: 'Current password is incorrect' },
        };
      }
    }
    if (!(await deps.setPassword(user.id, newPassword))) {
      return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
    }
    // Fresh session so cached claims reflect the cleared flag.
    const tokens = await deps.signIn(user.email, newPassword);
    if (!tokens) return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
    return { ok: true, tokens };
  } catch {
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
  }
}

/** Best-effort server-side session revocation; cookies are cleared by the caller. */
export async function logoutStaff(accessToken: string | undefined, deps: AuthDeps): Promise<void> {
  if (!accessToken) return;
  try {
    await deps.signOut(accessToken);
  } catch {
    // Cookie removal still ends the browser session.
  }
}
