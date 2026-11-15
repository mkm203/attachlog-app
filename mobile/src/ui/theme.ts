import type { EntryStatus } from '../api/types';

export const colors = {
  bg: '#F3F5F7',
  card: '#FFFFFF',
  text: '#14212B',
  muted: '#566673',
  border: '#D9E0E6',
  primary: '#0B6B5D',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#FCE8E6',
  ok: '#17663D',
  okBg: '#DDF3E6',
  warn: '#8A5A00',
  warnBg: '#FFF1CF',
  track: '#E3E8EC',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = 12;

export const statusColors: Record<EntryStatus, { fg: string; bg: string }> = {
  pending: { fg: colors.warn, bg: colors.warnBg },
  approved: { fg: colors.ok, bg: colors.okBg },
  rejected: { fg: colors.danger, bg: colors.dangerBg },
};
