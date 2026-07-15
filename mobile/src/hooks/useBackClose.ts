import { useEffect, useRef } from "react";
import { pushBackHandler } from "../services/backButton";

// While the calling component is mounted, the Android back button calls
// `onClose` (dismissing the popup/sub-view) instead of minimizing the app.
export function useBackClose(onClose: () => void): void {
  // Ref so re-renders don't re-register (which would reorder the stack).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => pushBackHandler(() => closeRef.current()), []);
}
