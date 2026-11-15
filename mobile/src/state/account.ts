import type { Me, Membership, Role, Session } from '../api/types';
import { roleLabel } from '../lib/format';

/** The signed-in person, with the role (and school) they are acting in right now. */
export interface Account {
  sub: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** Null for a brand-new account that has not joined anything yet. */
  role: Role | null;
  schoolId: string | null;
  /** "Coordinator · Univ One" style label of the active role. */
  contextLabel: string | null;
  contexts: Membership[];
  activeId: string | null;
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    const u = s.user as Partial<Me> | undefined;
    if (typeof s.token !== 'string' || !u || typeof u.id !== 'string' || typeof u.name !== 'string') return null;
    if (!Array.isArray(u.memberships) || typeof s.expiresAt !== 'number' || s.expiresAt <= Date.now()) return null;
    return s as Session;
  } catch {
    return null;
  }
}

/** Works out the active role: the saved choice if it still exists, otherwise the first one. */
export function toAccount(session: Session): Account {
  const contexts = session.user.memberships;
  const active = contexts.find((m) => m.id === session.activeId) ?? contexts[0] ?? null;
  return {
    sub: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.email_verified,
    role: active?.role ?? null,
    schoolId: active?.school_id ?? null,
    contextLabel: active ? contextLabel(active) : null,
    contexts,
    activeId: active?.id ?? null,
  };
}

/** "Coordinator · Univ One": the role and where it applies. Computed on demand so it follows the language. */
export function contextLabel(m: Membership): string {
  const place = m.school_name ?? m.company_name;
  return place ? `${roleLabel(m.role)} · ${place}` : roleLabel(m.role);
}
