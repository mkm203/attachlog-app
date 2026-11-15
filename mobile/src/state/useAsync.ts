import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `load` when the dependencies change and exposes {data, error, loading, reload}.
 * Stale answers are dropped, and the previous data stays on screen while it reloads.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null, error: null, loading: true,
  });
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => { if (latest.current === id) setState({ data, error: null, loading: false }); },
      (error) => { if (latest.current === id) setState({ data: null, error, loading: false }); },
    );
  }, deps);

  useEffect(() => {
    reload();
    return () => { latest.current++; };
  }, [reload]);

  return { ...state, reload };
}
