import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { AttachLogClient, toSession } from '../api/client';
import { DEFAULT_SERVER, SERVER_LOCKED, normalizeServer } from '../api/config';
import type { LoginResult, Me, Session } from '../api/types';
import { t } from '../i18n';
import { parseSession, toAccount } from './account';
import type { Account } from './account';
import { getItem, removeItem, setItem } from './storage';

const SESSION_KEY = 'attachlog.session';
const SERVER_KEY = 'attachlog.server';

interface SessionContextValue {
  /** False until the saved session and server address have been read. */
  ready: boolean;
  session: Session | null;
  server: string;
  /** Why the user was signed out ("session expired"), shown once on the login screen. */
  notice: string | null;
  api: AttachLogClient;
  /** `serverAddress` is what was typed on the login screen; it is saved when sign-in succeeds. */
  signIn: (email: string, password: string, serverAddress?: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; code: string; field_of_study?: string | null; specialty?: string | null }, serverAddress?: string) => Promise<void>;
  /** Replace the stored profile after it changed (joined a school, new role). */
  updateMe: (me: Me) => void;
  switchContext: (membershipId: string) => void;
  signOut: (notice?: string) => void;
  setServer: (address: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [server, setServerState] = useState(DEFAULT_SERVER);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [savedServer, savedSession] = await Promise.all([getItem(SERVER_KEY), getItem(SESSION_KEY)]);
      if (savedServer && !SERVER_LOCKED) setServerState(savedServer);
      const restored = parseSession(savedSession);
      if (restored) setSession(restored);
      else if (savedSession) await removeItem(SESSION_KEY);
      setReady(true);
    })();
  }, []);

  const signOut = useCallback((message?: string) => {
    setSession(null);
    setNotice(message ?? null);
    void removeItem(SESSION_KEY);
  }, []);

  // The client reports a 401 through this ref, so it never holds a stale signOut.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const api = useMemo(
    () => new AttachLogClient({
      server,
      token: session?.token ?? null,
      onUnauthorized: () => signOutRef.current(t('Your session has expired. Please sign in again.')),
    }),
    [server, session?.token],
  );

  const begin = useCallback(async (result: LoginResult, target: string) => {
    const next = toSession(result);
    await Promise.all([setItem(SESSION_KEY, JSON.stringify(next)), setItem(SERVER_KEY, target)]);
    setServerState(target);
    setNotice(null);
    setSession(next);
  }, []);

  const targetFor = useCallback(
    (serverAddress?: string) => (serverAddress === undefined || SERVER_LOCKED ? server : normalizeServer(serverAddress) || DEFAULT_SERVER),
    [server],
  );

  const signIn = useCallback(async (email: string, password: string, serverAddress?: string) => {
    const target = targetFor(serverAddress);
    await begin(await new AttachLogClient({ server: target }).login(email.trim(), password), target);
  }, [begin, targetFor]);

  const register = useCallback(async (
    input: { name: string; email: string; password: string; code: string; field_of_study?: string | null; specialty?: string | null }, serverAddress?: string,
  ) => {
    const target = targetFor(serverAddress);
    const clean = { ...input, name: input.name.trim(), email: input.email.trim(), code: input.code.trim(), field_of_study: input.field_of_study?.trim() || null, specialty: input.specialty?.trim() || null };
    await begin(await new AttachLogClient({ server: target }).register(clean), target);
  }, [begin, targetFor]);

  const updateMe = useCallback((me: Me) => {
    setSession((current) => {
      if (!current) return current;
      const keep = me.memberships.some((m) => m.id === current.activeId);
      const next = { ...current, user: me, activeId: keep ? current.activeId : me.memberships[0]?.id ?? null };
      void setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const switchContext = useCallback((membershipId: string) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, activeId: membershipId };
      void setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setServer = useCallback(async (input: string) => {
    const clean = normalizeServer(input) || DEFAULT_SERVER;
    setServerState(clean);
    await setItem(SERVER_KEY, clean);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ready, session, server, notice, api, signIn, register, updateMe, switchContext, signOut, setServer }),
    [ready, session, server, notice, api, signIn, register, updateMe, switchContext, signOut, setServer],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** The signed-in user. Only call it from screens that are shown after sign-in. */
export function useUser(): Account {
  const { session } = useSession();
  if (!session) throw new Error('No signed-in user');
  return useMemo(() => toAccount(session), [session]);
}
