/** Date helpers for the date picker. Dates travel as "YYYY-MM-DD" and are built in local time (no timezone drift). */
import { isIsoDate } from './validation';

export function toIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** "2026-09-07" -> a Date at local midnight, or null when it is not a valid date. */
export function fromIso(iso: string): Date | null {
  if (!isIsoDate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** The date the picker opens on: the current value, else today, always kept inside [min, max]. */
export function startingDate(value: string, min?: string, max?: string, today: Date = new Date()): Date {
  let date = fromIso(value) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lo = min ? fromIso(min) : null;
  const hi = max ? fromIso(max) : null;
  if (lo && date < lo) date = lo;
  if (hi && date > hi) date = hi;
  return date;
}
