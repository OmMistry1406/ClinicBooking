'use client';

import { useState, type FormEvent } from 'react';

export function StaffLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      window.location.assign(data.redirect ?? '/staff');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">Staff login</h1>
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="min-h-[44px] rounded border border-gray-400 px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="current-password"
          className="min-h-[44px] rounded border border-gray-400 px-3"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] rounded bg-blue-700 px-4 font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
