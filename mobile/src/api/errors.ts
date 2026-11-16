import { t } from '../i18n';

/**
 * Every AttachLog service answers errors with {"error": {"code", "message", "details"}}.
 * The app branches on the stable `code`, never on the message text.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_taken: 'This email already has an account. Sign in instead, then use "Join with a code" in Account.',
  email_unchanged: 'This is already your email address.',
  email_delivery_unavailable: 'The verification email could not be sent. Check the email setup and try again.',
  invalid_code: 'This code is not valid, was already used, or has expired. Check it or ask for a new one.',
  invite_email_mismatch: 'This code was sent to a different email address. Use the address it was sent to.',
  wrong_password: 'The current password is wrong.',
  student_not_in_school: 'That student is not a member of your school.',
  supervisor_not_in_school: 'That supervisor is not a member of your school.',
  school_required: 'Choose which school you are acting for.',
  not_authenticated: 'Your session has expired. Please sign in again.',
  invalid_token: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have permission to do that.",
  not_your_placement: 'You can only write in your own logbook.',
  not_assigned_supervisor: 'You are not the supervisor assigned to this placement.',
  entry_exists: 'An entry already exists for that week.',
  entry_locked: 'This entry is approved and can no longer be edited.',
  entry_not_pending: 'This entry has already been reviewed.',
  comment_required: 'A rejection needs a comment.',
  week_out_of_range: 'That week is outside the placement.',
  placement_closed: 'This placement is closed.',
  placement_not_found: 'Placement not found.',
  entry_not_found: 'Entry not found.',
  invalid_dates: 'The end date must be after the start date.',
  outside_term: "The dates must be inside your school's term.",
  validation_error: 'Some fields are not valid. Please check them and try again.',
  network_error: 'Cannot reach the server. Check the server address and your Wi-Fi.',
  timeout: 'The server is slow to answer. It may be waking up; please try again in a moment.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
};

/** True when the user must sign in again. */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** A sentence that is safe to show to the user. */
export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const known = MESSAGES[err.code];
    return known ? t(known) : err.message || t('Request failed ({status}).', { status: err.status });
  }
  if (err instanceof Error && err.message) return err.message;
  return t('Something went wrong. Please try again.');
}
