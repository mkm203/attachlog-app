import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BackHandler } from 'react-native';

import type { Entry, Placement } from '../api/types';

export interface ProfilePerson {
  user_id?: string;
  name: string;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  field_of_study?: string | null;
  specialty?: string | null;
  teaching_field?: string | null;
  bio?: string | null;
  avatar?: string | null;
}

export type Route =
  | { name: 'home' }
  | { name: 'notifications' }
  | { name: 'account' }
  | { name: 'school' }
  | { name: 'profile'; userId?: string; person?: ProfilePerson }
  | { name: 'placement'; id: string }
  | { name: 'entry'; id: string }
  | { name: 'entryForm'; placementId: string; totalWeeks: number; week?: number; entry?: Entry }
  | { name: 'placementForm' }
  | { name: 'supervisorsForm'; placement: Placement }
  | { name: 'closeForm'; placement: Placement };

export type Tab = 'home' | 'school' | 'account';

interface NavValue {
  route: Route;
  tab: Tab;
  canGoBack: boolean;
  push: (route: Route) => void;
  pop: () => void;
  setTab: (tab: Tab) => void;
  /** Bumps after a change, so lists and details behind the current screen reload. */
  revision: number;
  refresh: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [revision, setRevision] = useState(0);

  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    setStack([{ name: next }]);
  }, []);

  const canGoBack = stack.length > 1;

  // Android's back button walks back through the stack, then to the home tab, then leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { pop(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, tab, pop, setTab]);

  const value = useMemo<NavValue>(
    () => ({ route: stack[stack.length - 1]!, tab, canGoBack, push, pop, setTab, revision, refresh }),
    [stack, tab, canGoBack, push, pop, setTab, revision, refresh],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
}
