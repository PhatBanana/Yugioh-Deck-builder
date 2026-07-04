import { parseImportText } from "@shared/collection/importParser";
import type { OwnedCollection } from "@shared/recommendation/types";
import { db } from "../db";
import { httpGetJson } from "./http";

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
    await db.collection.put({ cardId, quantity: Math.min(99, quantity) });
  }
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
      else await db.collection.put({ cardId, quantity: Math.min(99, quantity) });
    }
  });
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
        await db.collection.put({
          cardId: m.cardId,
          quantity: Math.min(99, current + m.quantity),
        });
      } else {
        await db.collection.put({ cardId: m.cardId, quantity: Math.min(99, m.quantity) });
      }
    }
  });
}
