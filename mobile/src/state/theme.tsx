import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { applyScheme } from '../ui/theme';
import type { Scheme } from '../ui/theme';
import { getItem, setItem } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'attachlog.theme';

interface ThemeValue {
  preference: ThemePreference;
  scheme: Scheme;
  choose: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const isPreference = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';

/** Light, dark, or follow the phone. The colours are rewritten before the screens below are drawn again. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    let alive = true;
    void getItem(THEME_KEY).then((saved) => { if (alive && isPreference(saved)) setPreference(saved); });
    return () => { alive = false; };
  }, []);

  const scheme: Scheme = preference === 'system' ? system : preference;
  applyScheme(scheme);   // before the children render, so they read the right colours

  const choose = useCallback((next: ThemePreference) => {
    setPreference(next);
    void setItem(THEME_KEY, next);
  }, []);

  const value = useMemo(() => ({ preference, scheme, choose }), [preference, scheme, choose]);
  return (
    <ThemeContext.Provider value={value}>
      <Fragment key={scheme}>{children}</Fragment>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme needs ThemeProvider');
  return v;
}
