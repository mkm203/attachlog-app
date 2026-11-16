/**
 * Client-side checks that mirror the server's rules, so people get a message before a
 * round trip. The server stays the authority: it repeats every check and its error
 * codes are still shown when it disagrees.
 */
import type { Decision, PlacementInput } from '../api/types';
import { t } from '../i18n';

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Whole weeks covered by a placement, counted the way the placement service does. */
export function weeksBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.ceil((Math.round(ms / 86400000) + 1) / 7);
}

function parseInteger(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export interface EntryForm {
  week: string;
  tasks: string;
  hours: string;
  reflection: string;
  skills: string;
}

export function validateEntry(form: EntryForm, totalWeeks: number, requireWeek = true): FieldErrors<keyof EntryForm> {
  const errors: FieldErrors<keyof EntryForm> = {};
  if (requireWeek) {
    const week = parseInteger(form.week);
    if (week === null || week < 1) errors.week = t('Enter a week number, starting at 1.');
    else if (week > totalWeeks) errors.week = t('This placement has only {n} weeks.', { n: totalWeeks });
  }
  if (!form.tasks.trim()) errors.tasks = t('Describe what you did this week.');
  else if (form.tasks.length > 2000) errors.tasks = t('Keep it under {n} characters.', { n: 2000 });
  if ((form.reflection ?? '').length > 2000) errors.reflection = t('Keep it under {n} characters.', { n: 2000 });
  if ((form.skills ?? '').length > 400) errors.skills = t('Keep it under {n} characters.', { n: 400 });
  const hours = parseInteger(form.hours);
  if (hours === null || hours < 1 || hours > 60) errors.hours = t('Hours must be between 1 and 60.');
  return errors;
}

export function validateReview(decision: Decision, comment: string): FieldErrors<'comment'> {
  if (decision === 'rejected' && !comment.trim()) return { comment: t('A rejection needs a comment.') };
  if (comment.length > 1000) return { comment: t('Keep it under {n} characters.', { n: 1000 }) };
  return {};
}

/** The coordinator's form: two picked people plus typed company details. */
export type PlacementForm = Record<Exclude<keyof PlacementInput, 'school_id'>, string>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function validatePlacement(form: PlacementForm): FieldErrors<keyof PlacementForm> {
  const errors: FieldErrors<keyof PlacementForm> = {};
  const required: [keyof PlacementForm, string][] = [
    ['student_id', t('Choose the student.')],
    ['academic_supervisor_id', t('Choose the academic supervisor.')],
    ['company_name', t('Enter the company name.')],
    ['company_city', t('Enter the company city.')],
  ];
  for (const [key, message] of required) {
    if (!form[key].trim()) errors[key] = message;
  }
  if (!isEmail(form.company_supervisor_email)) errors.company_supervisor_email = t("Enter the supervisor's email address.");
  if (!isIsoDate(form.start_date.trim())) errors.start_date = t('Choose the start date.');
  if (!isIsoDate(form.end_date.trim())) errors.end_date = t('Choose the end date.');
  if (!errors.start_date && !errors.end_date && form.end_date.trim() <= form.start_date.trim()) {
    errors.end_date = t('The end date must be after the start date.');
  }
  return errors;
}

export function validateSupervisors(academic: string, companyEmail: string): FieldErrors<'academic' | 'company'> {
  const errors: FieldErrors<'academic' | 'company'> = {};
  if (!academic.trim()) errors.academic = t('Choose the academic supervisor.');
  if (!isEmail(companyEmail)) errors.company = t("Enter the supervisor's email address.");
  return errors;
}

export function validateEvaluation(score: string, comment: string): FieldErrors<'score' | 'comment'> {
  const errors: FieldErrors<'score' | 'comment'> = {};
  const value = parseInteger(score);
  if (value === null || value > 20) errors.score = t('Enter a whole score from 0 to 20.');
  if (!comment.trim()) errors.comment = t('Write a short evaluation comment.');
  else if (comment.length > 1000) errors.comment = t('Keep it under {n} characters.', { n: 1000 });
  return errors;
}

export function validateLogin(email: string, password: string): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  if (!isEmail(email)) errors.email = t('Enter your email address.');
  if (!password) errors.password = t('Enter your password.');
  return errors;
}

export const MIN_PASSWORD = 8;

export function validateNewPassword(password: string, repeat: string): FieldErrors<'password' | 'repeat'> {
  const errors: FieldErrors<'password' | 'repeat'> = {};
  if (password.length < MIN_PASSWORD) errors.password = t('Use at least {n} characters.', { n: MIN_PASSWORD });
  else if (password !== repeat) errors.repeat = t('The two passwords are not the same.');
  return errors;
}

export function validateRegister(
  f: { name: string; email: string; password: string; code: string },
): FieldErrors<'name' | 'email' | 'password' | 'code'> {
  const errors: FieldErrors<'name' | 'email' | 'password' | 'code'> = {};
  if (f.name.trim().length < 2) errors.name = t('Enter your full name.');
  if (!isEmail(f.email)) errors.email = t('Enter a valid email address.');
  if (f.password.length < MIN_PASSWORD) errors.password = t('Use at least {n} characters.', { n: MIN_PASSWORD });
  if (f.code.replace(/[^A-Za-z0-9]/g, '').length < 4) errors.code = t('Enter the code you were given.');
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
