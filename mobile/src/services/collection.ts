import { parseImportText } from "@shared/collection/importParser";
import type { OwnedCollection } from "@shared/recommendation/types";
import type { CardCondition } from "@shared/grading/analyze";
import { todayISO } from "../lib/util";
import { db, type MCollectionEntry } from "../db";
import { httpGetJson } from "./http";
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
    await putQuantity(cardId, quantity);
    // Start the card's price history at add time (best-effort) rather than
    // waiting for the next launch snapshot.
    recordPricePoints([cardId]).catch(() => {});
  }
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

export async function getCollectionStats(): Promise<CollectionStats> {
  const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
  const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
  let totalCopies = 0;
  let value = 0;
  entries.forEach((e, i) => {
    totalCopies += e.quantity;
    const price = cards[i]?.price;
    if (price != null) value += price * e.quantity;
  });
  return { uniqueCards: entries.length, totalCopies, estimatedValueUsd: value };
}

export interface ImportResult {
  matched: { cardId: number; name: string; quantity: number }[];
  unmatched: { raw: string; reason: string }[];
}

// Mirrors the desktop import resolver against IndexedDB, including the
// alternate-artwork id fallback for .ydk files.
export async function resolveImport(text: string): Promise<ImportResult> {
  const entries = parseImportText(text);
  const matched = new Map<number, { cardId: number; name: string; quantity: number }>();
  const unmatched: ImportResult["unmatched"] = [];

  const add = (cardId: number, name: string, quantity: number) => {
    const existing = matched.get(cardId);
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else matched.set(cardId, { cardId, name, quantity });
  };

  for (const entry of entries) {
    if (entry.cardId != null) {
      const local = await db.cards.get(entry.cardId);
      if (local) {
        add(local.id, local.name, entry.quantity);
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
          add(byName.id, byName.name, entry.quantity);
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
      add(byName.id, byName.name, entry.quantity);
      continue;
    }
    if (entry.raw !== entry.name) {
      const byRaw = await db.cards
        .where("nameLower")
        .equals(entry.raw.toLowerCase())
        .first();
      if (byRaw) {
        add(byRaw.id, byRaw.name, 1);
        continue;
      }
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
