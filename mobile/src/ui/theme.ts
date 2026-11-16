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
  bg: '#F3F6F1', sheet: '#FBFCF8', card: '#FFFFFF', cardAlt: '#F3F6F3', text: '#173438', muted: '#718487', border: '#DDE8E4',
  primary: '#176A63', primaryDark: '#104B47', primarySoft: '#DDF2EC', hero: '#103C3D', onPrimary: '#FFFFFF',
  accent: '#E77B5D', accentSoft: '#FCE9E1', mint: '#4E9D82', mintSoft: '#DFF1E7', peri: '#638FCE', periSoft: '#E7EFFB',
  sun: '#D49A3A', sunSoft: '#F8EECF', danger: '#C9504B', dangerBg: '#FBE6E2', ok: '#328567', okBg: '#DFF1E7',
  warn: '#A56A16', warnBg: '#F8EECF', track: '#E4ECE8', shadow: '#173438', heroDeco: 'rgba(220,255,236,0.10)',
};

const dark: Palette = {
  bg: '#0D191A', sheet: '#112224', card: '#182E30', cardAlt: '#20383A', text: '#EEF5EF', muted: '#A2B8B2', border: '#294346',
  primary: '#76CEB7', primaryDark: '#1C5E53', primarySoft: '#193D37', hero: '#0B3232', onPrimary: '#102B2C',
  accent: '#F09374', accentSoft: '#432B26', mint: '#72C4A0', mintSoft: '#1A3D32', peri: '#8EB3ED', periSoft: '#253650',
  sun: '#F1BF65', sunSoft: '#43371F', danger: '#F28C83', dangerBg: '#492B2A', ok: '#72C4A0', okBg: '#1A3D32',
  warn: '#F1BF65', warnBg: '#43371F', track: '#294044', shadow: '#000000', heroDeco: 'rgba(220,255,236,0.07)',
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
export const radius = 24;

/** One soft shadow for floating things (iOS shadow* and Android elevation together). */
export function lift(strength = 1) {
  return {
    shadowColor: colors.shadow, shadowOpacity: 0.1 * strength, shadowRadius: 14 * strength,
    shadowOffset: { width: 0, height: 6 * strength }, elevation: Math.round(3 * strength),
  };
}
