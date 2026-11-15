/**
 * Translations. The English text itself is the key: `t('Sign in')` returns the French sentence when the
 * language is French and the same English text otherwise (so a missing translation shows English, never a blank).
 * Placeholders are written {name} and filled from the second argument: t('Week {n}', { n: 3 }).
 */
import { FR } from './fr';

export type Language = 'en' | 'fr';
export const LANGUAGES: Language[] = ['en', 'fr'];

let current: Language = 'en';

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = language;
}

/** The phone's language when it is French, English for everything else. */
export function detectLanguage(): Language {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'fr';
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === 'fr' ? FR[text] ?? text : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (whole: string, key: string) => (key in vars ? String(vars[key]) : whole));
}

const MONTHS: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
};

export function monthName(index: number): string | undefined {
  return MONTHS[current][index];
}
