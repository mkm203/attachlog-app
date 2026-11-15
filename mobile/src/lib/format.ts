import type { Entry, EntryStatus, Role } from '../api/types';
import { monthName, t } from '../i18n';

export function roleLabel(role: Role): string {
  switch (role) {
    case 'student': return t('Student');
    case 'company_supervisor': return t('Company supervisor');
    case 'academic_supervisor': return t('Academic supervisor');
    case 'coordinator': return t('Coordinator');
  }
}

export function statusLabel(status: EntryStatus): string {
  switch (status) {
    case 'pending': return t('Pending');
    case 'approved': return t('Approved');
    case 'rejected': return t('Rejected');
  }
}

/** 2026-09-07 -> "7 Sep 2026". Returns the input unchanged when it is not an ISO date. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1) ?? m[2]} ${m[1]}`;
}

export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export function initials(name: string): string {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join('') || '?';
}

export function countByStatus(entries: Entry[]): Record<EntryStatus, number> {
  const counts: Record<EntryStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const e of entries) counts[e.status] += 1;
  return counts;
}

/** Week number -> entry, for drawing the week grid. */
export function entriesByWeek(entries: Entry[]): Map<number, Entry> {
  return new Map(entries.map((e) => [e.week, e]));
}

/** The first week that has no entry yet, or null when every week is covered. */
export function nextFreeWeek(entries: Entry[], totalWeeks: number): number | null {
  const taken = new Set(entries.map((e) => e.week));
  for (let w = 1; w <= totalWeeks; w++) if (!taken.has(w)) return w;
  return null;
}
