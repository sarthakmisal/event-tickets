import { formatINR } from '@et/shared';

export { formatINR };

const zone = 'Asia/Kolkata';
const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: zone,
});
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: zone });
const time = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: zone });

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtDate = (iso: string) => date.format(new Date(iso));
export const fmtTime = (iso: string) => time.format(new Date(iso));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Stable hue per name so avatars keep their colour. */
export const hueOf = (name: string) =>
  [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** `datetime-local` input value (IST wall-clock) from an ISO string, and back. */
export const toLocalInput = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  return d.toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => new Date(`${value}:00+05:30`).toISOString();

export const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.min(100, Math.round((part / whole) * 100));
