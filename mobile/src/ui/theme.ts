import type { EntryStatus } from '../api/types';

/** A field notebook: pale ruled paper, deep green ink, a yellow highlighter, rubber-stamp statuses. */
export const colors = {
  bg: '#F1F6F4',          // the paper
  rule: '#D3E4DF',        // its ruled lines
  card: '#FFFFFF',
  text: '#11231F',
  muted: '#566B66',
  border: '#B9D0CA',
  primary: '#0B6B5D',     // the ink
  primaryDark: '#06463C',
  primarySoft: '#DDEFEA',
  highlight: '#FFE45E',   // the marker
  accent: '#FFE45E',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#FCE8E6',
  ok: '#17663D',
  okBg: '#DDF3E6',
  warn: '#7A5200',
  warnBg: '#FFF1B8',
  track: '#DCE9E5',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = 12;
export const shadow = {} as const;   // flat on purpose: structure comes from ink lines, not shadows

export const statusColors: Record<EntryStatus, { fg: string; bg: string }> = {
  pending: { fg: colors.warn, bg: colors.warnBg },
  approved: { fg: colors.ok, bg: colors.okBg },
  rejected: { fg: colors.danger, bg: colors.dangerBg },
};
