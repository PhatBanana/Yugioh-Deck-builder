import Dexie, { type EntityTable } from "dexie";
import type { DeckCardRequirement } from "@shared/recommendation/types";
import type { DeckCard } from "@shared/deck/types";

// Slimmed card record — the full YGOPRODeck payload is ~50MB; we keep only
// what browsing, scanning and recommendations need (~5MB in IndexedDB).
export interface MCard {
  id: number;
  name: string;
  nameLower: string;
  type: string;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  atk: number | null;
  def: number | null;
  level: number | null;
  desc: string;
  banlist: string | null; // 'Banned' | 'Limited' | 'Semi-Limited'
  price: number | null; // lowest TCGPlayer USD
  img: string | null; // small image URL
}

export interface MCollectionEntry {
  cardId: number;
  quantity: number;
}

// Deck cards are embedded in the deck row (document style) — no join table.
export interface MMetaDeck {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  era: string | null; // "Modern" | "Edison" | "Goat" | ...
  strategy: string | null; // "Control" | "Burn" | ... (null when unknown)
  source: "scrape" | "static_snapshot";
  sourceUrl: string | null;
  lastUpdated: string;
  cards: Omit<DeckCardRequirement, "priceUsd">[];
}

export interface MSyncMeta {
  key: string;
  value: string;
}

// A user-built deck (document-style, cards embedded).
export interface MDeck {
  id: string;
  name: string;
  updatedAt: string;
  cards: DeckCard[];
}

export interface MWishlistEntry {
  cardId: number;
}

export const db = new Dexie("ygo-deck-builder") as Dexie & {
  cards: EntityTable<MCard, "id">;
  collection: EntityTable<MCollectionEntry, "cardId">;
  metaDecks: EntityTable<MMetaDeck, "id">;
  syncMeta: EntityTable<MSyncMeta, "key">;
  decks: EntityTable<MDeck, "id">;
  wishlist: EntityTable<MWishlistEntry, "cardId">;
};

db.version(1).stores({
  cards: "id, nameLower, archetype, type",
  collection: "cardId",
  metaDecks: "id",
  syncMeta: "key",
});

// v2 adds user decks and a wishlist. Existing stores are unchanged, so
// existing collections/cards migrate automatically.
db.version(2).stores({
  decks: "id, updatedAt",
  wishlist: "cardId",
});

export async function getSyncMeta(key: string): Promise<string | null> {
  return (await db.syncMeta.get(key))?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await db.syncMeta.put({ key, value });
}
