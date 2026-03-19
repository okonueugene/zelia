import { useState, useEffect, useCallback } from 'react';

/**
 * Returns [value, setValue, debouncedValue].
 * Updates to value are immediate; debouncedValue updates after `delayMs` of no changes.
 * Use debouncedValue for API query keys / fetches so search is responsive to typing
 * without firing a request on every keystroke.
 */
export function useDebouncedValue<T>(initial: T, delayMs: number = 300): [T, (v: T) => void, T] {
  const [value, setValue] = useState<T>(initial);
  const [debouncedValue, setDebouncedValue] = useState<T>(initial);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  const setValueCallback = useCallback((v: T) => setValue(v), []);
  return [value, setValueCallback, debouncedValue];
}
