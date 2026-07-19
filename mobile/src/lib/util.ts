// Small cross-service helpers that were previously re-implemented inline.

export const DAY_MS = 86_400_000;

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Today as YYYY-MM-DD. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True while an ISO timestamp is younger than `days`. */
export function isFresh(iso: string | undefined, days: number): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < days * DAY_MS;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Signed money delta, e.g. "+$1.37" / "−$0.50" (typographic minus). */
export function signedUsd(delta: number): string {
  return `${delta >= 0 ? "+" : "−"}${formatUsd(Math.abs(delta))}`;
}
