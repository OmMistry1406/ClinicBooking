import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  INVALID_CREDENTIALS_MESSAGE,
  LOCKOUT_MESSAGE,
  changeStaffPassword,
  loginStaff,
  logoutStaff,
  type AuthDeps,
} from '@/server/auth';
import { isSignupPath, jwtExpiry } from '@/lib/session';
import { middleware } from '@/middleware';

const GOOD = 'correct-horse-battery';
const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 };

function makeDeps(opts: { mustChange?: boolean; password?: string } = {}) {
  const counts = new Map<string, number>();
  let password = opts.password ?? GOOD;
  let mustChange = opts.mustChange ?? false;
  const deps: AuthDeps = {
    hit: vi.fn(async (key: string, max: number) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= max;
    }),
    signIn: vi.fn(async (_e: string, p: string) => (p === password ? tokens : null)),
    getUser: vi.fn(async (t: string) =>
      t === 'a' ? { id: 'u1', email: 'staff@clinic.test', mustChangePassword: mustChange } : null,
    ),
    setPassword: vi.fn(async (_id: string, p: string) => {
      password = p;
      mustChange = false;
      return true;
    }),
    signOut: vi.fn(async () => undefined),
  };
  return deps;
}

describe('loginStaff', () => {
  it('logs in with valid credentials', async () => {
    const r = await loginStaff({ email: 'Staff@Clinic.test', password: GOOD }, makeDeps());
    expect(r).toMatchObject({ ok: true, mustChangePassword: false });
  });

  it('wrong password and unknown email give the same generic error', async () => {
    const deps = makeDeps();
    deps.signIn = vi.fn(async () => null);
    const a = await loginStaff({ email: 'staff@clinic.test', password: 'wrong-password-123' }, deps);
    const b = await loginStaff({ email: 'nobody@clinic.test', password: 'wrong-password-123' }, deps);
    expect(a).toEqual({ ok: false, status: 401, error: INVALID_CREDENTIALS_MESSAGE });
    expect(b).toEqual(a);
  });

  it('rejects passwords under 12 chars with the same generic error without calling Supabase', async () => {
    const deps = makeDeps();
    const r = await loginStaff({ email: 'staff@clinic.test', password: 'short' }, deps);
    expect(r).toEqual({ ok: false, status: 401, error: INVALID_CREDENTIALS_MESSAGE });
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it('requires both fields', async () => {
    const r = await loginStaff({ email: '', password: undefined }, makeDeps());
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('locks out after 5 failed attempts, even for the correct password', async () => {
    const deps = makeDeps();
    for (let i = 0; i < 5; i++) {
      const r = await loginStaff({ email: 'staff@clinic.test', password: 'wrong-password-123' }, deps);
      expect(r).toMatchObject({ ok: false, status: 401 });
    }
    const locked = await loginStaff({ email: 'staff@clinic.test', password: GOOD }, deps);
    expect(locked).toEqual({ ok: false, status: 429, error: LOCKOUT_MESSAGE });
    expect(locked.ok === false && locked.error).toBe('Too many login attempts. Please try again in 10 minutes.');
    expect(deps.signIn).toHaveBeenCalledTimes(5);
  });

  it('lockout is per email', async () => {
    const deps = makeDeps();
    for (let i = 0; i < 6; i++) await loginStaff({ email: 'a@clinic.test', password: 'wrong-password-123' }, deps);
    const r = await loginStaff({ email: 'staff@clinic.test', password: GOOD }, deps);
    expect(r.ok).toBe(true);
  });

  it('returns 503 when the limiter fails', async () => {
    const deps = makeDeps();
    deps.hit = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await loginStaff({ email: 'staff@clinic.test', password: GOOD }, deps)).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it('flags first login', async () => {
    const r = await loginStaff({ email: 'staff@clinic.test', password: GOOD }, makeDeps({ mustChange: true }));
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
  });
});

describe('changeStaffPassword', () => {
  const NEW = 'a-brand-new-passphrase';

  it('requires a session', async () => {
    const r = await changeStaffPassword({ accessToken: undefined, newPassword: NEW, repeatPassword: NEW }, makeDeps());
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('first login: no current password needed, flag cleared, new session issued', async () => {
    const deps = makeDeps({ mustChange: true });
    const r = await changeStaffPassword({ accessToken: 'a', newPassword: NEW, repeatPassword: NEW }, deps);
    expect(r.ok).toBe(true);
    expect(deps.setPassword).toHaveBeenCalledWith('u1', NEW);
  });

  it('enforces 12+ characters', async () => {
    const deps = makeDeps({ mustChange: true });
    const r = await changeStaffPassword({ accessToken: 'a', newPassword: 'short1234', repeatPassword: 'short1234' }, deps);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.ok === false && r.fieldErrors?.newPassword).toMatch(/12/);
    const ok = await changeStaffPassword(
      { accessToken: 'a', newPassword: '123456789012', repeatPassword: '123456789012' },
      makeDeps({ mustChange: true }),
    );
    expect(ok.ok).toBe(true);
    expect(deps.setPassword).not.toHaveBeenCalled();
  });

  it('requires matching repeat', async () => {
    const r = await changeStaffPassword(
      { accessToken: 'a', newPassword: NEW, repeatPassword: NEW + 'x' },
      makeDeps({ mustChange: true }),
    );
    expect(r.ok === false && r.fieldErrors?.repeatPassword).toBeTruthy();
  });

  it('subsequent change requires the current password', async () => {
    const deps = makeDeps();
    const missing = await changeStaffPassword({ accessToken: 'a', newPassword: NEW, repeatPassword: NEW }, deps);
    expect(missing.ok === false && missing.fieldErrors?.currentPassword).toBeTruthy();

    const wrong = await changeStaffPassword(
      { accessToken: 'a', currentPassword: 'not-the-password!', newPassword: NEW, repeatPassword: NEW },
      deps,
    );
    expect(wrong.ok === false && wrong.fieldErrors?.currentPassword).toMatch(/incorrect/);
    expect(deps.setPassword).not.toHaveBeenCalled();

    const ok = await changeStaffPassword(
      { accessToken: 'a', currentPassword: GOOD, newPassword: NEW, repeatPassword: NEW },
      deps,
    );
    expect(ok.ok).toBe(true);
  });
});

describe('logout and routing helpers', () => {
  it('logout revokes the session and tolerates failures', async () => {
    const deps = makeDeps();
    await logoutStaff('a', deps);
    expect(deps.signOut).toHaveBeenCalledWith('a');
    deps.signOut = vi.fn(async () => {
      throw new Error('x');
    });
    await expect(logoutStaff('a', deps)).resolves.toBeUndefined();
  });

  it('detects sign-up paths', () => {
    for (const p of ['/signup', '/auth/signup', '/api/auth/signup', '/staff/signup', '/api/staff/signup']) {
      expect(isSignupPath(p)).toBe(true);
    }
    for (const p of ['/staff', '/api/staff/login', '/book']) expect(isSignupPath(p)).toBe(false);
  });

  it('middleware returns 404 for sign-up requests', async () => {
    const res = await middleware(new NextRequest('http://localhost/auth/signup', { method: 'POST' }));
    expect(res.status).toBe(404);
  });

  it('jwtExpiry reads exp', () => {
    const payload = btoa(JSON.stringify({ exp: 123 })).replace(/=+$/, '');
    expect(jwtExpiry(`h.${payload}.s`)).toBe(123);
    expect(jwtExpiry('garbage')).toBeNull();
  });
});
