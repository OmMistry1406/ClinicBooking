/** Client-safe display helpers. */

/** Formats an ISO instant as HH:mm in the given IANA time zone (e.g. clinic local time). */
export function formatClinicTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Value usable in a tel: href: keeps a leading + and digits only. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
