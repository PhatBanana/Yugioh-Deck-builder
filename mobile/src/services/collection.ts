import { parseImportText } from "@shared/collection/importParser";
import { matchCardName } from "@shared/scan/nameMatcher";
import type { OwnedCollection } from "@shared/recommendation/types";
import type { CardCondition } from "@shared/grading/analyze";
import { valueEntry } from "@shared/collection/value";
import { todayISO } from "../lib/util";
import { getNameCandidates } from "./scanner";
import { db, getSyncMeta, setSyncMeta, type MCard, type MCollectionEntry, type PrintingCopy } from "../db";
import { httpGetJson } from "./http";
import { loadPrintingPrices, printingPriceKey } from "./rarity";
import { recordPricePoints } from "./priceHistory";

// Writes a quantity while preserving any extra fields (condition) already on
// the entry. All quantity writes must go through this so a stepper tap can't
// wipe a saved condition.
async function putQuantity(cardId: number, quantity: number): Promise<void> {
  const existing = await db.collection.get(cardId);
  await db.collection.put({ ...existing, cardId, quantity: Math.min(99, quantity) });
}

export async function getOwnedMap(): Promise<OwnedCollection> {
  const owned: OwnedCollection = {};
  for (const e of await db.collection.toArray()) {
    if (e.quantity > 0) owned[e.cardId] = e.quantity;
  }
  return owned;
}

export async function setOwnedQuantity(cardId: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await db.collection.delete(cardId);
  } else {
    const prev = (await db.collection.get(cardId))?.quantity ?? 0;
    await putQuantity(cardId, quantity);
    // A drop in the total can leave the printing breakdown claiming more
    // copies than are owned — keep it in step.
    if (quantity < prev) await trimCopiesToQuantity(cardId);
    // Start the card's price history at add time (best-effort) rather than
    // waiting for the next launch snapshot.
    recordPricePoints([cardId]).catch(() => {});
  }
}

// Deletes a card's entry but returns the full record (printings, binders,
// condition, chosen art) so the caller can offer a true undo — restoring the
// quantity alone would silently drop everything else.
export async function removeOwnedWithSnapshot(cardId: number): Promise<MCollectionEntry | null> {
  const entry = await db.collection.get(cardId);
  await db.collection.delete(cardId);
  return entry ?? null;
}

// Merges extra fields (condition/tags/printing) onto an existing collection
// entry. No-op when the card isn't in the collection.
export async function patchCollectionEntry(
  cardId: number,
  patch: Partial<Omit<MCollectionEntry, "cardId" | "quantity">>
): Promise<void> {
  const existing = await db.collection.get(cardId);
  if (!existing) return;
  await db.collection.put({ ...existing, ...patch });
}

// Sets (or clears) the overall condition of the owned copies.
export async function setCondition(
  cardId: number,
  condition: CardCondition | undefined
): Promise<void> {
  await patchCollectionEntry(cardId, { condition });
}

// Sets which binders/tags the card is filed under.
export async function setTags(cardId: number, tags: string[]): Promise<void> {
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  await patchCollectionEntry(cardId, { tags: cleaned.length > 0 ? cleaned : undefined });
}

// Picks which artwork the owned copies display (an alternate-art image id), or
// clears back to the card's default art.
export async function setPreferredArt(cardId: number, artId: number | undefined): Promise<void> {
  await patchCollectionEntry(cardId, { artId });
}

// ---- Bulk edit: apply one change across many selected cards at once ----

// Adds a binder/tag to every listed owned card (no-op for ones not owned).
export async function bulkAddTag(cardIds: number[], tag: string): Promise<void> {
  const name = tag.trim();
  if (!name) return;
  await db.transaction("rw", db.collection, async () => {
    for (const id of cardIds) {
      const e = await db.collection.get(id);
      if (!e) continue;
      const tags = new Set(e.tags ?? []);
      tags.add(name);
      await db.collection.put({ ...e, tags: [...tags] });
    }
  });
}

// Sets (or clears) the condition on every listed owned card.
export async function bulkSetCondition(
  cardIds: number[],
  condition: CardCondition | undefined
): Promise<void> {
  await db.transaction("rw", db.collection, async () => {
    for (const id of cardIds) {
      const e = await db.collection.get(id);
      if (e) await db.collection.put({ ...e, condition });
    }
  });
}

// Removes every listed card from the collection. Returns the removed entries so
// the caller can offer an undo.
export async function bulkRemove(cardIds: number[]): Promise<MCollectionEntry[]> {
  const removed = (await db.collection.bulkGet(cardIds)).filter(
    (e): e is MCollectionEntry => !!e
  );
  await db.collection.bulkDelete(cardIds);
  return removed;
}

// Re-inserts entries removed by bulkRemove (undo).
export async function restoreEntries(entries: MCollectionEntry[]): Promise<void> {
  if (entries.length > 0) await db.collection.bulkPut(entries);
}

// Every binder/tag name in use, for suggestion chips and filters.
export async function allTags(): Promise<string[]> {
  const entries = await db.collection.toArray();
  return [...new Set(entries.flatMap((e) => e.tags ?? []))].sort((a, b) => a.localeCompare(b));
}

export async function addOwned(cardId: number, delta = 1): Promise<number> {
  const current = (await db.collection.get(cardId))?.quantity ?? 0;
  const next = Math.max(0, Math.min(99, current + delta));
  await setOwnedQuantity(cardId, next);
  return next;
}

// Sets exact quantities for many cards in one transaction (deck/archetype
// bulk import). quantity 0 removes the card from the collection.
export async function setOwnedMany(
  entries: { cardId: number; quantity: number }[]
): Promise<void> {
  await db.transaction("rw", db.collection, async () => {
    for (const { cardId, quantity } of entries) {
      if (quantity <= 0) await db.collection.delete(cardId);
      else await putQuantity(cardId, quantity);
    }
  });
  recordPricePoints(
    entries.filter((e) => e.quantity > 0).map((e) => e.cardId)
  ).catch(() => {});
}

export interface CollectionStats {
  uniqueCards: number;
  totalCopies: number;
  estimatedValueUsd: number;
}

// Change in collection value since the most recent snapshot from a *previous*
// day, compared against the live value passed in — so today's adds/removals
// count, not just what was snapshotted at launch. Null until there's a prior
// day to compare to.
export async function getValueDelta(currentValueUsd: number): Promise<number | null> {
  const today = todayISO();
  const snaps = await db.valueHistory.orderBy("date").reverse().toArray();
  const prior = snaps.find((s) => s.date < today);
  return prior ? currentValueUsd - prior.valueUsd : null;
}

// One-time migration: fold the old single `printing`/`edition` fields (set
// before the per-printing breakdown existed) into a `copies` entry so that
// data still shows and gets valued per printing. Runs once, gated by syncMeta.
export async function migrateLegacyPrintings(): Promise<void> {
  if (await getSyncMeta("legacy_printings_migrated")) return;
  const entries = await db.collection.toArray();
  const updates = entries
    .filter((e) => !e.copies?.length && (e.printing || e.edition))
    .map((e) => ({
      ...e,
      copies: [
        {
          code: e.printing?.code,
          rarity: e.printing?.rarity,
          edition: e.edition,
          quantity: e.quantity,
        },
      ],
    }));
  if (updates.length > 0) await db.collection.bulkPut(updates);
  await setSyncMeta("legacy_printings_migrated", "1");
}

export async function getCollectionStats(): Promise<CollectionStats> {
  const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
  const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
  // Price every attributed printing across the whole collection in one query.
  const priceMap = await loadPrintingPrices(entries.flatMap((e) => e.copies ?? []));
  const priceOf = (code?: string, rarity?: string): number | null => {
    const key = printingPriceKey(code, rarity);
    return key ? priceMap.get(key) ?? null : null;
  };
  let totalCopies = 0;
  let value = 0;
  entries.forEach((e, i) => {
    totalCopies += e.quantity;
    value += valueEntry(e.quantity, e.copies, cards[i]?.price ?? null, priceOf);
  });
  return { uniqueCards: entries.length, totalCopies, estimatedValueUsd: value };
}

// Whether a breakdown row is the given printing (code+rarity+edition match).
function samePrinting(
  c: PrintingCopy,
  printing: { code?: string; rarity?: string; edition?: string }
): boolean {
  return (
    (c.code ?? "") === (printing.code ?? "") &&
    (c.rarity ?? "") === (printing.rarity ?? "") &&
    (c.edition ?? "") === (printing.edition ?? "")
  );
}

// Adds (or removes, with a negative delta) one owned copy of a specific
// printing to a card's breakdown. Matches on code+rarity+edition so repeat
// scans of the same printing stack. No-op when the card isn't owned.
// `ambiguous` marks the added copy's rarity as a best guess; merging into an
// existing row keeps the flag only if BOTH sides are guesses (one confident
// attribution of a printing confirms the whole row).
export async function addPrintingCopy(
  cardId: number,
  printing: { code?: string; rarity?: string; edition?: string },
  delta = 1,
  ambiguous?: boolean
): Promise<void> {
  const existing = await db.collection.get(cardId);
  if (!existing) return;
  const copies = (existing.copies ?? []).map((c) => ({ ...c }));
  const idx = copies.findIndex((c) => samePrinting(c, printing));
  if (idx >= 0) {
    copies[idx].quantity += delta;
    if (copies[idx].quantity <= 0) copies.splice(idx, 1);
    else if (delta > 0) {
      if (copies[idx].ambiguous && ambiguous) copies[idx].ambiguous = true;
      else delete copies[idx].ambiguous;
    }
  } else if (delta > 0) {
    copies.push({ ...printing, quantity: delta, ...(ambiguous ? { ambiguous: true as const } : {}) });
  }
  await db.collection.put({ ...existing, copies: copies.length > 0 ? copies : undefined });
}

// Marks an ambiguous breakdown row as confirmed — the user says "yes, this IS
// that rarity" without moving any copies.
export async function confirmPrintingCopy(
  cardId: number,
  printing: { code?: string; rarity?: string; edition?: string }
): Promise<void> {
  const existing = await db.collection.get(cardId);
  if (!existing?.copies) return;
  const copies = existing.copies.map((c) => {
    if (!samePrinting(c, printing)) return c;
    const { ambiguous: _cleared, ...rest } = c;
    return rest as PrintingCopy;
  });
  await db.collection.put({ ...existing, copies });
}

// Moves copies from a (mis-)guessed printing row to the rarity the user
// actually holds, atomically — the card's total quantity is untouched, and the
// destination row comes out confirmed.
export async function refilePrintingCopy(
  cardId: number,
  from: { code?: string; rarity?: string; edition?: string },
  to: { code?: string; rarity?: string; edition?: string },
  qty = 1
): Promise<void> {
  if (qty <= 0) return;
  await db.transaction("rw", db.collection, async () => {
    await addPrintingCopy(cardId, from, -qty);
    await addPrintingCopy(cardId, to, qty, false);
  });
}

// Adjusts an owned printing by `delta`, moving the card's total *and* the
// breakdown together — so the card-detail editor's per-printing steppers add
// or remove real owned copies.
export async function adjustPrintingCopy(
  cardId: number,
  printing: { code?: string; rarity?: string; edition?: string },
  delta: number
): Promise<void> {
  if (delta === 0) return;
  const current = (await db.collection.get(cardId))?.quantity ?? 0;
  if (delta < 0) {
    // Shrink the exact printing first, so the quantity-drop reconcile inside
    // setOwnedQuantity finds the breakdown already in step and trims nothing.
    await addPrintingCopy(cardId, printing, delta);
    await setOwnedQuantity(cardId, Math.max(0, current + delta));
  } else {
    await setOwnedQuantity(cardId, Math.min(99, current + delta));
    await addPrintingCopy(cardId, printing, delta);
  }
}

// Keeps the breakdown from claiming more copies than are owned — called after
// the total drops, trimming newest-last. (Callers that know the exact printing
// removed don't come through here — scan undo removes that printing directly
// via addPrintingCopy before dropping the quantity.)
async function trimCopiesToQuantity(cardId: number): Promise<void> {
  const e = await db.collection.get(cardId);
  if (!e?.copies) return;
  let over = e.copies.reduce((n, c) => n + c.quantity, 0) - e.quantity;
  if (over <= 0) return;
  const copies = e.copies.map((c) => ({ ...c }));
  for (let i = copies.length - 1; i >= 0 && over > 0; i--) {
    const take = Math.min(copies[i].quantity, over);
    copies[i].quantity -= take;
    over -= take;
  }
  const kept = copies.filter((c) => c.quantity > 0);
  await db.collection.put({ ...e, copies: kept.length > 0 ? kept : undefined });
}

export interface ImportResult {
  matched: {
    cardId: number;
    name: string;
    quantity: number;
    img: string | null;
    typed?: string; // what the pasted line said, when a fuzzy match corrected it
  }[];
  unmatched: { raw: string; reason: string }[];
}

// Mirrors the desktop import resolver against IndexedDB, including the
// alternate-artwork id fallback for .ydk files. Names that miss exactly go
// through the scanner's fuzzy matcher (typed lists carry typos); corrected
// matches carry `typed` so the preview can show what it decided.
export async function resolveImport(text: string): Promise<ImportResult> {
  const entries = parseImportText(text);
  const matched = new Map<number, ImportResult["matched"][number]>();
  const unmatched: ImportResult["unmatched"] = [];

  const add = (card: MCard, quantity: number, typed?: string) => {
    const existing = matched.get(card.id);
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else matched.set(card.id, { cardId: card.id, name: card.name, quantity, img: card.img, typed });
  };

  // Fuzzy candidates loaded once, only if some name misses exactly.
  let candidates: Awaited<ReturnType<typeof getNameCandidates>> | null = null;

  for (const entry of entries) {
    if (entry.cardId != null) {
      const local = await db.cards.get(entry.cardId);
      if (local) {
        add(local, entry.quantity);
        continue;
      }
      try {
        const json = await httpGetJson<{ data?: { name?: string }[] }>(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${entry.cardId}`
        );
        const name = json.data?.[0]?.name;
        const byName = name
          ? await db.cards.where("nameLower").equals(name.toLowerCase()).first()
          : undefined;
        if (byName) {
          add(byName, entry.quantity);
          continue;
        }
      } catch {
        // fall through to unmatched
      }
      unmatched.push({ raw: entry.raw, reason: `Unknown card id ${entry.cardId}` });
      continue;
    }

    const byName = await db.cards
      .where("nameLower")
      .equals(entry.name!.toLowerCase())
      .first();
    if (byName) {
      add(byName, entry.quantity);
      continue;
    }
    if (entry.raw !== entry.name) {
      const byRaw = await db.cards
        .where("nameLower")
        .equals(entry.raw.toLowerCase())
        .first();
      if (byRaw) {
        add(byRaw, 1);
        continue;
      }
    }
    // Typos: same fuzzy matcher the scanner uses, reported via `typed`.
    candidates ??= await getNameCandidates();
    const [top] = matchCardName(entry.name!, candidates, { limit: 1, minScore: 0.55 });
    const fuzzyCard = top ? await db.cards.get(top.id) : undefined;
    if (fuzzyCard) {
      add(fuzzyCard, entry.quantity, entry.name);
      continue;
    }
    unmatched.push({ raw: entry.raw, reason: `No card named "${entry.name}"` });
  }

  return { matched: [...matched.values()], unmatched };
}

export async function applyImport(
  matched: ImportResult["matched"],
  mode: "add" | "set"
): Promise<void> {
  await db.transaction("rw", db.collection, async () => {
    for (const m of matched) {
      if (mode === "add") {
        const current = (await db.collection.get(m.cardId))?.quantity ?? 0;
        await putQuantity(m.cardId, current + m.quantity);
      } else {
        await putQuantity(m.cardId, m.quantity);
      }
    }
  });
  recordPricePoints(matched.map((m) => m.cardId)).catch(() => {});
}

// Records today's collection value (one row per day, last write wins) so the
// Cards tab can chart it over time. Called once on app launch; skips empty
// collections so a fresh install doesn't chart a flat $0 line.
export async function recordValueSnapshot(): Promise<void> {
  const stats = await getCollectionStats();
  if (stats.totalCopies === 0) return;
  await db.valueHistory.put({
    date: todayISO(),
    valueUsd: stats.estimatedValueUsd,
    uniqueCards: stats.uniqueCards,
    totalCopies: stats.totalCopies,
  });
}
