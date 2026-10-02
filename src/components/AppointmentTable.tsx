import { allowedActions, type StaffAction } from '@/lib/appointmentActions';
import { formatClinicTime, telHref } from '@/lib/format';
import type { AppointmentStatus, StaffAppointment } from '@/server/appointments';

const BADGE: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
  confirmed: 'bg-green-100 text-green-900 ring-green-300',
  cancelled: 'bg-gray-200 text-gray-700 ring-gray-400 line-through',
  no_show: 'bg-red-100 text-red-900 ring-red-300',
};

const LABEL: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      data-status={status}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${BADGE[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}

const ACTION_LABEL: Record<StaffAction, string> = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  no_show: 'Mark No-Show',
};

export function AppointmentTable({
  appointments,
  tz,
  now,
  onAction,
  busyId,
}: {
  appointments: StaffAppointment[];
  tz: string;
  /** Action buttons are rendered only when both `now` and `onAction` are given. */
  now?: Date;
  onAction?: (id: string, action: StaffAction) => void;
  busyId?: string | null;
}) {
  const withActions = !!now && !!onAction;
  if (appointments.length === 0) return <p>No appointments.</p>;
  const showEmail = appointments.some((a) => !!a.email);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2">Time</th>
            <th className="p-2">Name</th>
            <th className="p-2">Phone</th>
            {showEmail && <th className="p-2">Email</th>}
            <th className="p-2">Status</th>
            <th className="p-2">Notes</th>
            {withActions && <th className="p-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id} className="border-b align-top">
              <td className="p-2 whitespace-nowrap">{formatClinicTime(a.slot_start, tz)}</td>
              <td className="p-2">{a.name}</td>
              <td className="p-2 whitespace-nowrap">
                <a className="inline-block min-h-11 py-2 text-blue-700 underline" href={telHref(a.phone)}>
                  {a.phone}
                </a>
              </td>
              {showEmail && <td className="p-2">{a.email ?? ''}</td>}
              <td className="p-2">
                <StatusBadge status={a.status} />
              </td>
              <td className="p-2">{a.notes ?? ''}</td>
              {withActions && (
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    {allowedActions(a.status, a.slot_start, now!).map((act) => (
                      <button
                        key={act}
                        type="button"
                        data-action={act}
                        disabled={busyId === a.id}
                        onClick={() => onAction!(a.id, act)}
                        className="min-h-11 rounded border px-3 disabled:opacity-50"
                      >
                        {ACTION_LABEL[act]}
                      </button>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
