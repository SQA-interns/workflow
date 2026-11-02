import { useCallback, useEffect, useState } from 'react';

/** Loads data on mount and whenever `deps` change; exposes reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    run().then(
      (d) => {
        if (active) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      },
      (e: unknown) => {
        if (active) {
          setError(e);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [run]);
  return { data, error, loading, reload, setData };
}
