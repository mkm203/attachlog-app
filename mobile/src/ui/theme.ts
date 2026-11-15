import type { EntryStatus } from '../api/types';

export const colors = {
  bg: '#F2F6F5',
  card: '#FFFFFF',
  text: '#10201C',
  muted: '#5B6E69',
  border: '#DCE5E2',
  primary: '#0B6B5D',
  primaryDark: '#07463D',
  primarySoft: '#E1F1EE',
  accent: '#F2A93B',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#FCE8E6',
  ok: '#17663D',
  okBg: '#DDF3E6',
  warn: '#8A5A00',
  warnBg: '#FFF1CF',
  track: '#E2EAE8',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = 16;

/** A soft shadow that works on both platforms. */
export const shadow = {
  shadowColor: '#06302A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
} as const;

export const statusColors: Record<EntryStatus, { fg: string; bg: string }> = {
  pending: { fg: colors.warn, bg: colors.warnBg },
  approved: { fg: colors.ok, bg: colors.okBg },
  rejected: { fg: colors.danger, bg: colors.dangerBg },
};
