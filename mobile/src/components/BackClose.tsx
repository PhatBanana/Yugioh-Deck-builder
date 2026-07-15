import { useBackClose } from "../hooks/useBackClose";

// Renders nothing; while mounted, the Android back button calls `onBack`.
// For conditional sub-views where calling the hook directly would break the
// rules of hooks.
export default function BackClose({ onBack }: { onBack: () => void }) {
  useBackClose(onBack);
  return null;
}
