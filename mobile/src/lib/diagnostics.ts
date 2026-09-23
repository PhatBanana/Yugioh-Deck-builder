// A small, persistent diagnostics log for remote debugging.
//
// Device testing happens on a phone nobody here can see. Before this, a
// failure that didn't crash the app — an error toast, a swallowed exception,
// a card the scanner just wouldn't match — left no trace beyond "it didn't
// work". This keeps the recent evidence (capped, so it can't grow) and lets
// the user copy it as one block of text from Backup & restore.
//
// Two rings, persisted to localStorage so they survive the app being killed:
//   - events: non-fatal errors and every error toast the user saw
//   - ocr: the last few OCR reads — what the recognizer actually returned and
//     what it matched — which is the only way to tell "OCR read garbage" from
//     "the matcher missed" when a card won't scan
//
// Logging is harmless where escalating is not: crashGuard deliberately shows
// the crash screen only for fatal database errors. Everything here just
// records.

const EVENTS_KEY = "ygo-diag-events";
const OCR_KEY = "ygo-diag-ocr";
const MAX_EVENTS = 60;
const MAX_OCR = 8;
const MAX_TEXT = 500;

export interface DiagEvent {
  at: string;
  kind: "error" | "toast" | "rejection";
  message: string;
}

export interface OcrRead {
  at: string;
  script: string;
  lines: string[];
  top?: string; // best match "Name (score)"
  byPasscode?: boolean;
  setCode?: string | null;
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function push<T>(key: string, entry: T, max: number): void {
  try {
    const list = read<T>(key);
    list.push(entry);
    localStorage.setItem(key, JSON.stringify(list.slice(-max)));
  } catch {
    // Storage full or unavailable — diagnostics must never cause a failure.
  }
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

function describe(reason: unknown): string {
  if (reason instanceof Error) {
    const inner = (reason as { inner?: unknown }).inner;
    const innerText = inner instanceof Error ? ` (inner ${inner.name}: ${inner.message})` : "";
    return `${reason.name}: ${reason.message}${innerText}`;
  }
  return typeof reason === "string" ? reason : JSON.stringify(reason) ?? String(reason);
}

export function logEvent(kind: DiagEvent["kind"], message: string): void {
  push<DiagEvent>(EVENTS_KEY, { at: new Date().toISOString(), kind, message: clip(message) }, MAX_EVENTS);
}

export function recordOcrRead(read: Omit<OcrRead, "at">): void {
  push<OcrRead>(
    OCR_KEY,
    {
      ...read,
      at: new Date().toISOString(),
      // Card text below the name is long and useless here; the top lines are
      // where the name, and usually the set code, live.
      lines: read.lines.slice(0, 14).map((l) => clip(l)),
    },
    MAX_OCR
  );
}

export function clearDiagnostics(): void {
  try {
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(OCR_KEY);
  } catch {
    // ignore
  }
}

export function diagnosticsCounts(): { events: number; ocr: number } {
  return { events: read(EVENTS_KEY).length, ocr: read(OCR_KEY).length };
}

let installed = false;

// Records every uncaught error and unhandled rejection. Runs alongside the
// crash guard, which decides separately whether one is fatal.
export function installDiagnostics(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => logEvent("error", describe(e.error ?? e.message)));
  window.addEventListener("unhandledrejection", (e) => logEvent("rejection", describe(e.reason)));
}

// The block the user pastes back: environment first, then newest-first logs.
export function buildDiagnosticsReport(context: Record<string, string | number | null>): string {
  const events = read<DiagEvent>(EVENTS_KEY).slice().reverse();
  const ocr = read<OcrRead>(OCR_KEY).slice().reverse();
  const out: string[] = ["YGO Deck Builder — diagnostics", `generated ${new Date().toISOString()}`, ""];
  for (const [k, v] of Object.entries(context)) out.push(`${k}: ${v ?? "—"}`);
  out.push("", `== Recent OCR reads (${ocr.length}) ==`);
  if (ocr.length === 0) out.push("(none — scan a card first)");
  for (const r of ocr) {
    out.push(
      `[${r.at}] script=${r.script} match=${r.top ?? "none"}${r.byPasscode ? " (passcode)" : ""} set=${r.setCode ?? "—"}`
    );
    for (const l of r.lines) out.push(`    | ${l}`);
  }
  out.push("", `== Errors & error toasts (${events.length}) ==`);
  if (events.length === 0) out.push("(none)");
  for (const e of events) out.push(`[${e.at}] ${e.kind}: ${e.message}`);
  return out.join("\n");
}
