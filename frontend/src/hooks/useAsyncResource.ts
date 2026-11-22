import { useState, useEffect, useCallback, useRef } from 'react';

export function useAsyncResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 可変長 deps を意図的に受け取るフックのため、依存チェックを無効化する
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const stableLoad = useCallback(load, deps);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await stableLoad();
      if (mountedRef.current) setData(result);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [stableLoad]);

  // 意図的に可変長 deps を渡しているため、effect 内の setState は許可する
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { run(); }, [run]);

  return { data, loading, error, reload: run };
}
