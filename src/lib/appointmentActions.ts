/** Pure, client-safe rules for which staff actions an appointment offers (FR-08, FR-09). */

export type StaffAction = 'confirm' | 'cancel' | 'no_show';
type Status = 'pending' | 'confirmed' | 'cancelled' | 'no_show';

export const CANCEL_DIALOG_MESSAGE = 'This will free the time slot and the patient will not be notified. Proceed?';

/** Status a row must currently have for the action to be allowed, and the status it moves to. */
export function allowedActions(status: Status, slotStartIso: string, now: Date): StaffAction[] {
  const start = Date.parse(slotStartIso);
  if (Number.isNaN(start)) return [];
  const future = start > now.getTime();
  const out: StaffAction[] = [];
  if (status === 'pending') out.push('confirm');
  if ((status === 'pending' || status === 'confirmed') && future) out.push('cancel');
  if (status === 'confirmed' && !future) out.push('no_show');
  return out;
}

export function isStaffAction(v: unknown): v is StaffAction {
  return v === 'confirm' || v === 'cancel' || v === 'no_show';
}
