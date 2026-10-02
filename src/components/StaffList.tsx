'use client';

import { useState, useTransition } from 'react';
import { changeStatusAction, fetchAppointmentsAction } from '@/app/staff/actions';
import { CANCEL_DIALOG_MESSAGE, type StaffAction } from '@/lib/appointmentActions';
import type { StaffAppointment } from '@/server/appointments';
import { AppointmentTable } from './AppointmentTable';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  tz: string;
  today: string;
  min: string;
  max: string;
  initialAppointments: StaffAppointment[];
}

export function StaffList({ tz, today, min, max, initialAppointments }: Props) {
  const [date, setDate] = useState(today);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function onChange(value: string) {
    // Typed values outside the range are ignored (min/max also disable them in the picker).
    if (!value || value < min || value > max) return;
    setDate(value);
    setError(null);
    startTransition(async () => {
      const res = await fetchAppointmentsAction(value);
      if (res.ok) setAppointments(res.appointments);
      else setError(res.status === 401 ? 'Session expired. Please sign in again.' : res.error);
    });
  }

  function run(id: string, action: StaffAction) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await changeStatusAction(id, action);
      if (res.ok) {
        setAppointments((rows) => rows.map((r) => (r.id === id ? { ...r, ...res.appointment } : r)));
      } else {
        setError(res.status === 401 ? 'Session expired. Please sign in again.' : res.error);
      }
      setBusyId(null);
    });
  }

  function onAction(id: string, action: StaffAction) {
    if (action === 'cancel') setConfirming(id);
    else run(id, action);
  }

  return (
    <section>
      <label className="mb-4 flex flex-col gap-1 text-sm font-medium">
        Date
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full max-w-xs rounded border px-2"
        />
      </label>
      {error && (
        <p role="alert" className="mb-2 text-red-700">
          {error}
        </p>
      )}
      <div aria-busy={pending} className={pending ? 'opacity-60' : undefined}>
        <AppointmentTable appointments={appointments} tz={tz} now={new Date()} onAction={onAction} busyId={busyId} />
      </div>
      {confirming && (
        <ConfirmDialog
          message={CANCEL_DIALOG_MESSAGE}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const id = confirming;
            setConfirming(null);
            run(id, 'cancel');
          }}
        />
      )}
    </section>
  );
}
