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
    decks.push({
      id: row.id,
      name: row.name,
      archetype: row.archetype,
      era: row.era ?? null,
      strategy: row.strategy ?? null,
      cards,
    });
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
  const out: MetaDeckOwnedCard[] = [];
  for (const [cardId, { needed, isKeyCard }] of byId) {
    const card = await db.cards.get(cardId);
    const owned = (await db.collection.get(cardId))?.quantity ?? 0;
    out.push({ cardId, name: card?.name ?? `#${cardId}`, img: card?.img ?? null, needed, owned, isKeyCard });
  }
  return out;
}
