import { recommendTopDecks } from "@shared/recommendation/recommend";
import type { DeckRecommendation, MetaDeck } from "@shared/recommendation/types";
import { db } from "../db";
import { getOwnedMap } from "./collection";
import { ensureMetaDecksSeeded } from "./metaDecks";

export async function getRecommendations(options?: {
  limit?: number;
  includeSide?: boolean;
}): Promise<DeckRecommendation[]> {
  await ensureMetaDecksSeeded();
  const [owned, rows] = await Promise.all([getOwnedMap(), db.metaDecks.toArray()]);

  // Join current card prices into the deck requirements.
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

  return recommendTopDecks(decks, owned, options);
}
