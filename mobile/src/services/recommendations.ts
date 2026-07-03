import { recommendTopDecks } from "@shared/recommendation/recommend";
import { rankPurchases, type PurchaseSuggestion } from "@shared/recommendation/purchases";
import type { DeckRecommendation, MetaDeck } from "@shared/recommendation/types";
import { db } from "../db";
import { getOwnedMap } from "./collection";
import { ensureMetaDecksSeeded } from "./metaDecks";

// Loads cached meta decks and joins current card prices into each requirement.
async function loadPricedDecks(): Promise<MetaDeck[]> {
  await ensureMetaDecksSeeded();
  const rows = await db.metaDecks.toArray();
  const priceCache = new Map<number, number | null>();
  const decks: MetaDeck[] = [];
  for (const row of rows) {
    const cards = [];
    for (const c of row.cards) {
      if (!priceCache.has(c.cardId)) {
        priceCache.set(c.cardId, (await db.cards.get(c.cardId))?.price ?? null);
      }
      cards.push({ ...c, priceUsd: priceCache.get(c.cardId) ?? null });
    }
    decks.push({ id: row.id, name: row.name, archetype: row.archetype, cards });
  }
  return decks;
}

export async function getRecommendations(options?: {
  limit?: number;
  includeSide?: boolean;
}): Promise<DeckRecommendation[]> {
  const [owned, decks] = await Promise.all([getOwnedMap(), loadPricedDecks()]);
  return recommendTopDecks(decks, owned, options);
}

export async function getPurchaseSuggestions(limit = 8): Promise<PurchaseSuggestion[]> {
  const [owned, decks] = await Promise.all([getOwnedMap(), loadPricedDecks()]);
  return rankPurchases(decks, owned, { limit });
}
