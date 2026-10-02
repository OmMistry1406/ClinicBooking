'use client';

import { useState, type FormEvent } from 'react';

const inputClass = 'min-h-[44px] rounded border border-gray-400 px-3';

export function ChangePasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch('/api/staff/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.get('currentPassword') ?? undefined,
          newPassword: form.get('newPassword'),
          repeatPassword: form.get('repeatPassword'),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Record<string, string>;
        redirect?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign('/staff');
          return;
        }
        setError(data.error ?? 'Something went wrong. Please try again.');
        setFieldErrors(data.fieldErrors ?? {});
        return;
      }
      window.location.assign(data.redirect ?? '/staff');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string, label: string, autoComplete: string) => (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input
        name={name}
        type="password"
        required
        minLength={name === 'currentPassword' ? undefined : 12}
        autoComplete={autoComplete}
        aria-invalid={fieldErrors[name] ? true : undefined}
        className={inputClass}
      />
      {fieldErrors[name] && <span className="text-sm text-red-700">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{requireCurrent ? 'Change password' : 'Set a new password'}</h1>
      {!requireCurrent && <p>For security, please choose a new password of at least 12 characters.</p>}
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {requireCurrent && field('currentPassword', 'Current password', 'current-password')}
      {field('newPassword', 'New password (12+ characters)', 'new-password')}
      {field('repeatPassword', 'Repeat new password', 'new-password')}
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] rounded bg-blue-700 px-4 font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
