import type { EntryStatus } from '../api/types';

export type Scheme = 'light' | 'dark';

interface Palette {
  bg: string; sheet: string; card: string; cardAlt: string; text: string; muted: string; border: string;
  primary: string; primaryDark: string; primarySoft: string; hero: string; onPrimary: string;
  accent: string; accentSoft: string; mint: string; mintSoft: string; peri: string; periSoft: string;
  sun: string; sunSoft: string; danger: string; dangerBg: string; ok: string; okBg: string; warn: string; warnBg: string;
  track: string; shadow: string; heroDeco: string;
}

const light: Palette = {
  bg: '#F2F5FF', sheet: '#FFFFFF', card: '#FFFFFF', cardAlt: '#F6F7FB', text: '#0F172A', muted: '#6B7280', border: '#E6E8F0',
  primary: '#4F46E5', primaryDark: '#3730A3', primarySoft: '#E8E7FF', hero: '#4F46E5', onPrimary: '#FFFFFF',
  accent: '#F97316', accentSoft: '#FFE8D9', mint: '#10B981', mintSoft: '#DDF7EC', peri: '#06B6D4', periSoft: '#D9F6FB',
  sun: '#F59E0B', sunSoft: '#FEF3C7', danger: '#EF4444', dangerBg: '#FEE2E2', ok: '#10B981', okBg: '#DDF7EC',
  warn: '#B45309', warnBg: '#FEF3C7', track: '#E8EBF5', shadow: '#111827', heroDeco: 'rgba(255,255,255,0.10)',
};

const dark: Palette = {
  bg: '#0B1020', sheet: '#12172A', card: '#171D33', cardAlt: '#1E2540', text: '#EAF0FF', muted: '#9AA4C7', border: '#262E4A',
  primary: '#818CF8', primaryDark: '#312E81', primarySoft: '#22275A', hero: '#3730A3', onPrimary: '#FFFFFF',
  accent: '#FB923C', accentSoft: '#3A2416', mint: '#34D399', mintSoft: '#123528', peri: '#22D3EE', periSoft: '#0F2E36',
  sun: '#FBBF24', sunSoft: '#3A300F', danger: '#F87171', dangerBg: '#3B171A', ok: '#34D399', okBg: '#123528',
  warn: '#FBBF24', warnBg: '#3A300F', track: '#242B45', shadow: '#000000', heroDeco: 'rgba(255,255,255,0.06)',
};

/** The live colours. `applyScheme` rewrites them, then the app redraws (see state/theme.tsx). */
export const colors: Palette = { ...light };

export const statusColors: Record<EntryStatus, { fg: string; bg: string }> = {
  pending: { fg: light.warn, bg: light.warnBg },
  approved: { fg: light.ok, bg: light.okBg },
  rejected: { fg: light.danger, bg: light.dangerBg },
};

export function applyScheme(scheme: Scheme): void {
  Object.assign(colors, scheme === 'dark' ? dark : light);
  statusColors.pending = { fg: colors.warn, bg: colors.warnBg };
  statusColors.approved = { fg: colors.ok, bg: colors.okBg };
  statusColors.rejected = { fg: colors.danger, bg: colors.dangerBg };
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = 20;

/** One soft shadow for floating things (iOS shadow* and Android elevation together). */
export function lift(strength = 1) {
  return {
    shadowColor: colors.shadow, shadowOpacity: 0.1 * strength, shadowRadius: 14 * strength,
    shadowOffset: { width: 0, height: 6 * strength }, elevation: Math.round(3 * strength),
  };
}
