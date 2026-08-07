// Escalates fatal errors that React error boundaries can't see — async
// failures and event-handler throws — to the app's crash screen. Without
// this, a database that fails to open (corruption, quota, or an older APK
// installed over a newer schema) surfaces as a silent black screen.
//
// Deliberately narrow: only errors that mean the local database is unusable
// are escalated. Escalating every unhandled rejection would turn harmless
// background noise (a flaky fetch someone forgot to .catch) into a full-screen
// "crash", which is worse than the disease.

const FATAL_NAMES = new Set([
  "VersionError", // an older APK opened a newer schema (downgrade)
  "OpenFailedError",
  "UpgradeError",
  "SchemaError",
  "DatabaseClosedError",
  "MissingAPIError", // IndexedDB unavailable (private mode / broken webview)
  "QuotaExceededError",
  "UnknownError", // Chromium's catch-all for on-disk IndexedDB corruption
]);

let listener: ((error: Error) => void) | null = null;

// The error boundary registers itself here so both crash paths (render throw,
// fatal async failure) converge on the same recovery screen.
export function onFatalError(fn: (error: Error) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function maybeEscalate(reason: unknown): void {
  // Dexie wraps causes; check the error itself then its `inner`.
  const err = reason instanceof Error ? reason : null;
  if (!err) return;
  const inner = (err as { inner?: unknown }).inner;
  const fatal = FATAL_NAMES.has(err.name)
    ? err
    : inner instanceof Error && FATAL_NAMES.has(inner.name)
      ? inner
      : null;
  if (fatal && listener) listener(fatal);
}

export function installCrashGuard(): void {
  window.addEventListener("unhandledrejection", (e) => maybeEscalate(e.reason));
  window.addEventListener("error", (e) => maybeEscalate(e.error));
}
