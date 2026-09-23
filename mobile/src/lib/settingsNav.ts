// Opens the app-wide Settings sheet from anywhere — the header button, the
// backup reminder toast, the Welcome screen's "Restore a backup". App owns the
// sheet and registers here; everything else just calls openSettings().

let listener: (() => void) | null = null;

export function openSettings(): void {
  listener?.();
}

export function onOpenSettings(fn: () => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
