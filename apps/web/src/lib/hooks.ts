import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, demo } from './api';

export interface Query<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export const errorMessage = (e: unknown): string =>
  e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong';

/** Loads data, reloads when `deps` change, optionally polls, and (in the demo) when the demo clock/toggles change. */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[], pollMs?: number): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const alive = useRef(true);

  const run = useCallback(() => {
    fetchRef.current().then(
      (value) => alive.current && (setData(value), setError(null), setLoading(false)),
      (e: unknown) => alive.current && (setError(errorMessage(e)), setLoading(false)),
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    run();
    const timer = pollMs ? setInterval(run, pollMs) : undefined;
    const unsubscribe = demo?.subscribe(run);
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
      unsubscribe?.();
    };
  }, [...deps, pollMs]);

  return { data, error, loading, reload: run };
}
