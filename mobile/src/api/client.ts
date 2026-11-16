import { DEFAULT_SERVER, normalizeServer } from './config';
import { ApiError } from './errors';
import type {
  Decision, Entry, Grant, LoginResult, Me, Member, Page, Placement, PlacementInput, Progress, Review, Role,
  SchoolDetail, Session,
} from './types';

export interface ClientOptions {
  /** Address of the API, as typed by the user or taken from the build configuration. */
  server?: string;
  token?: string | null;
  /** Called once when a request that carried a token gets a 401. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Query = Record<string, string | number | null | undefined>;

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT';
  query?: Query;
  body?: unknown;
  /** Send the bearer token (default true). */
  auth?: boolean;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  ok: boolean;
  json: unknown;
}

function toQuery(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** The first role is active until the person picks another one. */
export function toSession(result: LoginResult, now: number = Date.now()): Session {
  return {
    token: result.access_token,
    user: result.user,
    activeId: result.user.memberships[0]?.id ?? null,
    expiresAt: now + result.expires_in * 1000,
  };
}

export class AttachLogClient {
  readonly baseUrl: string;
  private token: string | null;
  private onUnauthorized: (() => void) | undefined;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = normalizeServer(options.server ?? '') || DEFAULT_SERVER;
    this.token = options.token ?? null;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    // A free cloud server can take a while to wake up after being idle.
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  // ---------------------------------------------------------------- transport

  private async call(path: string, o: CallOptions = {}): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (o.auth !== false && this.token) headers.Authorization = `Bearer ${this.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.baseUrl + path + toQuery(o.query), {
        method: o.method ?? 'GET',
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      return { status: res.status, ok: res.ok, json };
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'timeout', 'The server took too long to answer.');
      }
      throw new ApiError(0, 'network_error', `Cannot reach ${this.baseUrl}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private unauthorized(): void {
    if (this.token) this.onUnauthorized?.();
  }

  private restError(r: RawResponse, sentToken: boolean): ApiError {
    const body = r.json as { error?: { code?: string; message?: string; details?: unknown } } | null;
    const err = body?.error;
    if (r.status === 401 && sentToken) this.unauthorized();
    return new ApiError(
      r.status,
      err?.code ?? 'http_error',
      err?.message ?? `HTTP ${r.status}`,
      err?.details,
    );
  }

  private async rest<T>(path: string, o: CallOptions = {}): Promise<T> {
    const r = await this.call(path, o);
    if (!r.ok) throw this.restError(r, o.auth !== false);
    return r.json as T;
  }

  // ------------------------------------------------------------------- health

  /** True when the API answers /health. Never throws. Waits long enough for a sleeping cloud server. */
  async health(): Promise<boolean> {
    try {
      const r = await this.call('/health', { auth: false, timeoutMs: 60000 });
      return r.ok;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------- auth

  login(email: string, password: string): Promise<LoginResult> {
    return this.rest('/v1/auth/login', { method: 'POST', body: { email, password }, auth: false });
  }

  /** Create an account with an invite code or a school's join code. */
  register(input: { name: string; email: string; password: string; code: string }): Promise<LoginResult> {
    return this.rest('/v1/auth/register', { method: 'POST', body: input, auth: false });
  }

  me() {
    return this.rest<Me>('/v1/me');
  }

  /** Add a role or a school to the account with a code. */
  redeem(code: string) {
    return this.rest<Me>('/v1/me/redeem', { method: 'POST', body: { code } });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.rest<null>('/v1/me/password', {
      method: 'POST', body: { current_password: currentPassword, new_password: newPassword },
    });
  }

  forgotPassword(email: string) {
    return this.rest<{ status: string }>('/v1/auth/forgot', { method: 'POST', body: { email }, auth: false });
  }

  resetPassword(email: string, code: string, newPassword: string) {
    return this.rest<null>('/v1/auth/reset', { method: 'POST', body: { email, code, new_password: newPassword }, auth: false });
  }

  // ------------------------------------------------------------------ school

  school(id: string) {
    return this.rest<SchoolDetail>(`/v1/schools/${encodeURIComponent(id)}`);
  }

  members(schoolId: string, role?: Exclude<Role, 'company_supervisor'>) {
    return this.rest<Member[]>(`/v1/schools/${encodeURIComponent(schoolId)}/members`, { query: { role } });
  }

  inviteAcademicSupervisor(schoolId: string, email: string) {
    return this.rest<Grant>(`/v1/schools/${encodeURIComponent(schoolId)}/staff`, {
      method: 'POST', body: { email, role: 'academic_supervisor' },
    });
  }

  // -------------------------------------------------------------- placements

  listPlacements(f: { status?: 'open' | 'closed'; studentId?: string; schoolId?: string; page?: number; pageSize?: number } = {}) {
    return this.rest<Page<Placement>>('/v1/placements', {
      query: { status: f.status, student_id: f.studentId, school_id: f.schoolId, page: f.page ?? 1, page_size: f.pageSize ?? 10 },
    });
  }

  /** Every placement that matches, walking through the pages. */
  async allPlacements(f: { status?: 'open' | 'closed'; studentId?: string; schoolId?: string } = {}): Promise<Placement[]> {
    const out: Placement[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await this.listPlacements({ ...f, page, pageSize: 100 });
      out.push(...data.items);
      if (out.length >= data.total || data.items.length === 0) break;
    }
    return out;
  }

  getPlacement(id: string) {
    return this.rest<Placement>(`/v1/placements/${encodeURIComponent(id)}`);
  }

  createPlacement(input: PlacementInput) {
    return this.rest<Placement>('/v1/placements', { method: 'POST', body: input });
  }

  updateSupervisors(id: string, supervisors: { company_supervisor_email: string; academic_supervisor_id: string }) {
    return this.rest<Placement>(`/v1/placements/${encodeURIComponent(id)}`, { method: 'PUT', body: supervisors });
  }

  closePlacement(id: string, evaluation: { score: number; comment: string }) {
    return this.rest<Placement>(`/v1/placements/${encodeURIComponent(id)}/close`, { method: 'POST', body: evaluation });
  }

  progress(placementId: string) {
    return this.rest<Progress>(`/v1/placements/${encodeURIComponent(placementId)}/progress`);
  }

  activity(placementId: string) {
    return this.rest<import('./types').AuditEvent[]>(`/v1/placements/${encodeURIComponent(placementId)}/activity`);
  }

  // ----------------------------------------------------------------- entries

  createEntry(placementId: string, entry: { week: number; tasks: string; hours: number; reflection?: string | null; skills?: string | null }) {
    return this.rest<Entry>(`/v1/placements/${encodeURIComponent(placementId)}/entries`, { method: 'POST', body: entry });
  }

  updateEntry(id: string, entry: { tasks: string; hours: number; reflection?: string | null; skills?: string | null }) {
    return this.rest<Entry>(`/v1/entries/${encodeURIComponent(id)}`, { method: 'PUT', body: entry });
  }

  getEntry(id: string) {
    return this.rest<Entry>(`/v1/entries/${encodeURIComponent(id)}`);
  }

  listEntries(f: { placementId?: string; status?: Entry['status']; page?: number; pageSize?: number } = {}) {
    return this.rest<Page<Entry>>('/v1/entries', {
      query: { placementId: f.placementId, status: f.status, page: f.page ?? 1, page_size: f.pageSize ?? 10 },
    });
  }

  /** Every entry that matches, walking through the pages. */
  async allEntries(f: { placementId?: string; status?: Entry['status'] } = {}): Promise<Entry[]> {
    const out: Entry[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await this.listEntries({ ...f, page, pageSize: 100 });
      out.push(...data.items);
      if (out.length >= data.total || data.items.length === 0) break;
    }
    return out;
  }

  // ----------------------------------------------------------------- reviews

  listReviews(entryId: string) {
    return this.rest<Review[]>(`/v1/entries/${encodeURIComponent(entryId)}/reviews`);
  }

  /** Approve or reject. A rejection needs a comment; a blank comment is sent as null. */
  reviewEntry(entryId: string, decision: Decision, comment?: string) {
    return this.rest<Review>(`/v1/entries/${encodeURIComponent(entryId)}/reviews`, {
      method: 'POST',
      body: { decision, comment: comment?.trim() ? comment.trim() : null },
    });
  }
}
