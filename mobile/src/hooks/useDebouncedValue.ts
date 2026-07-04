import { useEffect, useState } from "react";

// Returns a copy of `value` that only updates after it has stopped changing
// for `delayMs`. Used to keep card-search table scans off the typing path.
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
