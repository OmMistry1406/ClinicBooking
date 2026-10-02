'use client';

import { useState } from 'react';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/staff/logout', { method: 'POST' });
    } finally {
      window.location.assign('/staff');
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="min-h-[44px] rounded border border-gray-400 px-4 disabled:opacity-60"
    >
      Log out
    </button>
  );
}
