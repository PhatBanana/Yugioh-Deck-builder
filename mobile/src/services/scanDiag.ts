// Scan diagnostics: a small ring buffer tracing each commit through the
// printing pipeline (set-code read → index lookup → foil flash → filed
// rarity → training capture), so "rarity/flash/capture does nothing" reports
// can say exactly WHERE the chain stopped instead of guessing. Persisted to
// localStorage so a trace survives leaving the scan page; surfaced (and
// shareable) from Scan settings.

export interface CommitTrace {
  at: string; // HH:MM:SS
  name: string;
  /** Set code as read by the tick's full-frame OCR (null = missed). */
  codeFromTick: string | null;
  /** Result of the focused strip retry: code, "failed", or "skipped". */
  stripRetry: string | "failed" | "skipped";
  /** Rarities the offline index returned for the final code. */
  indexRarities: string[];
  /** Whether the torch foil check fired, and what it concluded. */
  torch: { fired: boolean; tier?: string; confidence?: number; reason: string };
  /** What resolution filed (set async, after the lookup). */
  filed?: { rarity?: string; agreement?: string; ambiguous?: boolean };
  /** Training capture outcome for this commit. */
  capture: "trusted" | "pending" | "off" | "none";
  settings: { detectPrinting: boolean; autoFoilCheck: boolean; captureTraining: boolean };
}

const KEY = "ygo-scan-diag";
const MAX = 20;

let traces: CommitTrace[] | null = null;
const listeners = new Set<() => void>();

function load(): CommitTrace[] {
  if (traces) return traces;
  try {
    traces = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CommitTrace[];
  } catch {
    traces = [];
  }
  return traces;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(traces ?? []));
  } catch {
    // Diagnostics never break anything.
  }
  snapshot = null; // invalidate the useSyncExternalStore snapshot
  for (const fn of listeners) fn();
}

export function traceCommit(trace: CommitTrace): void {
  const list = load();
  list.unshift(trace);
  if (list.length > MAX) list.length = MAX;
  save();
}

// The filed outcome arrives async (background printing resolution) — attach
// it to the newest trace for this card name.
export function traceFiled(name: string, filed: CommitTrace["filed"], capture: CommitTrace["capture"]): void {
  const list = load();
  const t = list.find((x) => x.name === name && !x.filed);
  if (!t) return;
  t.filed = filed;
  t.capture = capture;
  save();
}

// Stable snapshot for useSyncExternalStore — same reference until a change.
let snapshot: CommitTrace[] | null = null;

export function getTraces(): CommitTrace[] {
  snapshot ??= [...load()];
  return snapshot;
}

export function subscribeTraces(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearTraces(): void {
  traces = [];
  save();
}

// One trace as a compact human line, for display and share.
export function traceLine(t: CommitTrace): string {
  const code =
    t.codeFromTick ??
    (t.stripRetry !== "failed" && t.stripRetry !== "skipped" ? `${t.stripRetry} (strip)` : null);
  const parts = [
    `${t.at} ${t.name}`,
    `code: ${code ?? `none (tick miss, strip ${t.stripRetry})`}`,
    `index: ${t.indexRarities.length ? t.indexRarities.join(" / ") : "no match"}`,
    `flash: ${t.torch.fired ? `fired → ${t.torch.tier ?? "?"} (${((t.torch.confidence ?? 0) * 100).toFixed(0)}%)` : t.torch.reason}`,
    `filed: ${t.filed ? `${t.filed.rarity ?? "—"}${t.filed.ambiguous ? " (ambiguous)" : ""}${t.filed.agreement ? ` [${t.filed.agreement}]` : ""}` : "…"}`,
    `photo: ${t.capture}`,
  ];
  return parts.join(" · ");
}
