// What the Add tab added lately, for its "Recently added" list — so a card a
// scan misread, or a paste that matched the wrong name, can be undone after
// the fact instead of hunted down on the Cards tab.
//
// A per-device convenience, kept in localStorage (capped): it's a view of
// recent actions, not collection data, so it isn't backed up.
//
// Two ways to undo one add exist — this list, and the scanner's own session
// undo — so each entry can be taken back once. `takeAdd` removes it and
// remembers the id; whichever path comes second finds it gone and skips the
// database change instead of removing a second copy.

import { useSyncExternalStore } from "react";

const KEY = "ygo-recent-adds";
const MAX = 30;

export type AddPrinting = { code?: string; rarity?: string; edition?: string };

export interface RecentAdd {
  id: string;
  cardId: number;
  name: string;
  delta: number;
  source: "scan" | "search" | "paste" | "deck";
  at: string;
  // For a scanned copy, the printing row it was filed under, so undo removes
  // exactly that copy.
  printing?: AddPrinting;
}

function read(): RecentAdd[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let cache: RecentAdd[] = read();
const listeners = new Set<() => void>();
const taken = new Set<string>();

function write(next: RecentAdd[]): void {
  cache = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the list is a convenience; keep it in memory.
  }
  listeners.forEach((fn) => fn());
}

let seq = 0;

// Records adds; only positive deltas are adds. Returns the new entries' ids.
export function logAdds(adds: Omit<RecentAdd, "id" | "at">[]): string[] {
  const at = new Date().toISOString();
  const entries = adds
    .filter((a) => a.delta > 0)
    .map((a) => ({ ...a, id: `${Date.now().toString(36)}-${(seq++).toString(36)}`, at }));
  if (entries.length > 0) write([...[...entries].reverse(), ...cache]);
  return entries.map((e) => e.id);
}

export function logAdd(add: Omit<RecentAdd, "id" | "at">): string | undefined {
  return logAdds([add])[0];
}

export function setAddPrinting(id: string | undefined, printing: AddPrinting): void {
  if (!id || !cache.some((e) => e.id === id)) return;
  write(cache.map((e) => (e.id === id ? { ...e, printing } : e)));
}

// Removes an entry so it can't be undone twice. Returns false when it was
// already taken back (by the other undo path).
export function takeAdd(id: string | undefined): boolean {
  if (!id) return true; // not logged: nothing to guard
  if (taken.has(id)) return false;
  taken.add(id);
  if (cache.some((e) => e.id === id)) write(cache.filter((e) => e.id !== id));
  return true;
}

export function clearRecentAdds(): void {
  write([]);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useRecentAdds(): RecentAdd[] {
  return useSyncExternalStore(subscribe, () => cache);
}
