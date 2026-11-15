import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { detectLanguage, isLanguage, setLanguage } from '../i18n';
import type { Language } from '../i18n';
import { getItem, setItem } from './storage';

const LANGUAGE_KEY = 'attachlog.language';

interface LanguageValue {
  language: Language;
  choose: (language: Language) => void;
}

const LanguageContext = createContext<LanguageValue | null>(null);

/**
 * Starts in the language the person chose before, otherwise the phone's (French or English).
 * Changing it rebuilds the screens below (key), so every text is drawn again in the new language.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<Language | null>(null);

  useEffect(() => {
    let alive = true;
    void getItem(LANGUAGE_KEY).then((saved) => {
      const chosen = isLanguage(saved) ? saved : detectLanguage();
      setLanguage(chosen);
      if (alive) setState(chosen);
    });
    return () => { alive = false; };
  }, []);

  const choose = useCallback((next: Language) => {
    setLanguage(next);
    setState(next);
    void setItem(LANGUAGE_KEY, next);
  }, []);

  const value = useMemo(() => (language ? { language, choose } : null), [language, choose]);
  if (!value) return null;
  return (
    <LanguageContext.Provider value={value}>
      <Fragment key={value.language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage needs a LanguageProvider');
  return value;
}
