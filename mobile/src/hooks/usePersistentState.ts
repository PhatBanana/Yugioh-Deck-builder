import { useState } from "react";

// useState that persists to localStorage under `key`, so a choice (tab, view,
// filters) survives an app restart. Falls back to `initial` when nothing is
// stored or storage is unavailable.
export function usePersistentState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = (value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage full/unavailable — the value just won't persist.
      }
      return next;
    });
  };

  return [state, set];
}
