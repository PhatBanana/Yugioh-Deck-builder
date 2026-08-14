import { recommendTopDecks } from "@shared/recommendation/recommend";
import { rankPurchases, type PurchaseSuggestion } from "@shared/recommendation/purchases";
import type { DeckRecommendation, MetaDeck } from "@shared/recommendation/types";
import { db } from "../db";
import { getOwnedMap } from "./collection";
import { ensureMetaDecksSeeded } from "./metaDecks";

// Loads cached meta decks and joins current card prices into each requirement.
// Prices are fetched with a single bulkGet over every distinct card id rather
// than one query per card, since this runs on every Meta tab load.
async function loadPricedDecks(): Promise<MetaDeck[]> {
  await ensureMetaDecksSeeded();
  const rows = await db.metaDecks.toArray();
  const ids = [...new Set(rows.flatMap((r) => r.cards.map((c) => c.cardId)))];
  const cards = await db.cards.bulkGet(ids);
  const priceById = new Map<number, number | null>();
  ids.forEach((id, i) => priceById.set(id, cards[i]?.price ?? null));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    archetype: row.archetype,
    era: row.era ?? null,
    strategy: row.strategy ?? null,
    cards: row.cards.map((c) => ({ ...c, priceUsd: priceById.get(c.cardId) ?? null })),
  }));
}

// The Meta tab needs both at once — one owned-map scan and one priced-deck
// join instead of two helpers independently redoing the identical load.
export async function getMetaTabData(options?: {
  limit?: number;
  includeSide?: boolean;
  purchaseLimit?: number;
}): Promise<{ recommendations: DeckRecommendation[]; purchases: PurchaseSuggestion[] }> {
  const [owned, decks] = await Promise.all([getOwnedMap(), loadPricedDecks()]);
  return {
    recommendations: recommendTopDecks(decks, owned, options),
    purchases: rankPurchases(decks, owned, { limit: options?.purchaseLimit ?? 8 }),
  };
}

export interface MetaDeckOwnedCard {
  cardId: number;
  name: string;
  img: string | null;
  needed: number;
  owned: number;
  isKeyCard: boolean;
}

// The cards a meta deck needs, joined with how many you own — so the Meta tab
// can show clearly which specific cards you already have. Side deck excluded
// (matches the completion scoring). Duplicate card ids across sections are
// merged so a card is shown once.
export async function getMetaDeckOwnership(deckId: string): Promise<MetaDeckOwnedCard[]> {
  const meta = await db.metaDecks.get(deckId);
  if (!meta) return [];
  const byId = new Map<number, { needed: number; isKeyCard: boolean }>();
  for (const c of meta.cards) {
    if (c.section === "side") continue;
    const prev = byId.get(c.cardId);
    byId.set(c.cardId, {
      needed: (prev?.needed ?? 0) + c.quantity,
      isKeyCard: prev?.isKeyCard || c.isKeyCard,
    });
  }
  const ids = [...byId.keys()];
  const [cards, coll] = await Promise.all([db.cards.bulkGet(ids), db.collection.bulkGet(ids)]);
  return ids.map((cardId, i) => {
    const { needed, isKeyCard } = byId.get(cardId)!;
    return {
      cardId,
      name: cards[i]?.name ?? `#${cardId}`,
      img: cards[i]?.img ?? null,
      needed,
      owned: coll[i]?.quantity ?? 0,
      isKeyCard,
    };
  });
}
