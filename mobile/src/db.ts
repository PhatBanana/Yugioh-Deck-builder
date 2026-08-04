import Dexie, { type EntityTable, type Table } from "dexie";
import type { DeckCardRequirement } from "@shared/recommendation/types";
import type { DeckCard } from "@shared/deck/types";
import type { CardCondition } from "@shared/grading/analyze";

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
  banlist: string | null; // TCG: 'Banned' | 'Limited' | 'Semi-Limited'
  banOcg?: string | null; // OCG banlist (null until the next full card sync)
  banGoat?: string | null; // Goat-format banlist (same)
  // Master Duel regulation (from the data-pack sync): null = in the game and
  // unlimited; undefined = no data yet OR not in Master Duel.
  banMd?: string | null;
  // Speed Duel: PRESENT (even as null) = the card is in the Speed pool, with
  // its limit; undefined = not in the pool (or no data yet — the deck editor
  // distinguishes via the pack-fetched flag).
  speedLimit?: string | null;
  // Yugipedia page id (from the data-pack sync) — powers the "Rulings &
  // errata" link. Undefined until the pack has been fetched.
  ypId?: number;
  price: number | null; // lowest TCGPlayer USD
  img: string | null; // small image URL (the default/first artwork)
  // Image ids of every artwork this card has, when it has more than one
  // (most cards have a single artwork and leave this unset). URLs are built
  // from an id via lib/art. The first id corresponds to `img`.
  arts?: number[];
}

// One printing you own of a card: rarity + edition (+ set code) with its own
// count and condition. Each is valued at that printing's own price, so a
// Secret Rare copy is worth more than a Common of the same card. The card
// entry's `quantity` stays the total across all printings (what deck-building
// counts); the breakdown is a refinement, and any copies not attributed to a
// printing fall back to the generic card price.
export interface PrintingCopy {
  code?: string; // set code as printed, region included, when known
  rarity?: string; // e.g. "Secret Rare"
  edition?: string; // "1st Edition" / "Limited Edition"; unset = Unlimited
  quantity: number;
  condition?: CardCondition;
  // True when the rarity is a best guess: the set code maps to several
  // rarities and neither vision nor the user has confirmed which this copy
  // is. Cleared when the user confirms/re-files it. (Non-indexed field —
  // needs no Dexie version bump.)
  ambiguous?: true;
}

export interface MCollectionEntry {
  cardId: number;
  quantity: number;
  // Overall condition of the owned copies (worst copy, by convention). Set
  // manually or from the rough camera grader; optional — most entries won't
  // have one.
  condition?: CardCondition;
  // Which printing the owned copies are (set code + rarity), picked from the
  // card's known sets or read off the card while scanning. Legacy single-
  // printing field, superseded by `copies`; still read for back-compat.
  printing?: { code: string; rarity: string };
  // Edition marking read while scanning ("1st Edition" / "Limited Edition").
  // Legacy single-edition field, superseded by `copies`.
  edition?: string;
  // Per-printing breakdown of the owned copies (rarity/edition/value). The
  // sum of copy quantities is at most `quantity`; the remainder is copies
  // whose printing isn't known.
  copies?: PrintingCopy[];
  // Binder/tag names this card is filed under (e.g. "trade binder").
  tags?: string[];
  // Preferred artwork image id, when the owner picked an alternate art for a
  // card that has several. Unset = the card's default artwork.
  artId?: number;
}

// Cached list of a card's printings (sets), fetched on demand when the user
// opens the printing picker — the full card DB sync strips set data to stay
// small.
export interface MCardSets {
  cardId: number;
  fetchedAt: string;
  sets: { code: string; name: string; rarity: string; price: number | null }[];
}

// The catalogue of all card sets (from cardsets.php), fetched once and cached
// so the Sets browser can search offline afterwards.
export interface MSet {
  name: string;
  nameLower: string;
  code: string | null;
  cardCount: number;
  date: string | null; // TCG release date, when known
}

// A set's contents resolved against the local card DB (fetched on demand).
export interface MSetCards {
  setName: string;
  fetchedAt: string;
  cardIds: number[];
  unresolvedCount: number; // cards in the set with no local match
}

// A logged trade: what left and what arrived, valued at log time.
export interface MTrade {
  id: string;
  date: string; // ISO timestamp
  gave: { cardId: number; quantity: number }[];
  got: { cardId: number; quantity: number }[];
  gaveValueUsd: number;
  gotValueUsd: number;
  note?: string;
}

// One collection-value snapshot per day, recorded on app launch, so the Cards
// tab can chart value over time.
export interface MValueSnapshot {
  date: string; // YYYY-MM-DD (primary key — one row per day)
  valueUsd: number;
  uniqueCards: number;
  totalCopies: number;
}

// Deck cards are embedded in the deck row (document style) — no join table.
export interface MMetaDeck {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  era: string | null; // "Modern" | "Edison" | "Goat" | ...
  strategy: string | null; // "Control" | "Burn" | ... (null when unknown)
  source: "scrape" | "static_snapshot" | "live_search";
  sourceUrl: string | null;
  lastUpdated: string;
  cards: Omit<DeckCardRequirement, "priceUsd">[];
}

// A card's localized name from an installed language pack (ja/ko/de/…), so
// search and OCR matching can work in that language. One row per (card,
// language); installing a pack replaces that language's rows wholesale.
export interface MAltName {
  cardId: number;
  lang: string; // ISO 639-1 code, e.g. "ja"
  name: string;
  nameLower: string;
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
  // Strategy notes: turn order, combo lines, tech choices. Seeded with a
  // generated game-plan blurb when copied from a meta deck.
  notes?: string;
  // Card ids the owner marked as "starters" in the deck-odds analyzer, so the
  // consistency reading persists between visits.
  starters?: number[];
}

export interface MWishlistEntry {
  cardId: number;
}

// Global rarity/foil index, built from the full card dump on sync (which
// carries every card's set list — the same data the per-card printing cache
// holds, but for the whole database at once). Lets the scanner resolve a
// scanned set code to its rarity instantly and offline. One row per
// (canonical code + rarity); a code with two rarities in a set yields two.
export interface MPrintingIndex {
  codeCanon: string; // region- and zero-pad-insensitive key (see canonSetCode)
  code: string; // the set code as printed, region included
  rarity: string;
  cardId: number;
  priceUsd: number | null; // this printing's own price (set_price), when known
}

// One price point per tracked card per day, so the card detail sheet can chart
// a card's price over time. Only cards in the collection or wishlist are
// tracked — snapshotting all ~13k cards daily would bloat IndexedDB.
export interface MPricePoint {
  cardId: number;
  date: string; // YYYY-MM-DD ([cardId+date] is the primary key — one row per card per day)
  priceUsd: number;
}

export const db = new Dexie("ygo-deck-builder") as Dexie & {
  cards: EntityTable<MCard, "id">;
  collection: EntityTable<MCollectionEntry, "cardId">;
  metaDecks: EntityTable<MMetaDeck, "id">;
  syncMeta: EntityTable<MSyncMeta, "key">;
  decks: EntityTable<MDeck, "id">;
  wishlist: EntityTable<MWishlistEntry, "cardId">;
  valueHistory: EntityTable<MValueSnapshot, "date">;
  priceHistory: Table<MPricePoint, [number, string]>;
  cardSets: EntityTable<MCardSets, "cardId">;
  sets: EntityTable<MSet, "name">;
  setCards: EntityTable<MSetCards, "setName">;
  trades: EntityTable<MTrade, "id">;
  printingIndex: Table<MPrintingIndex, [string, string]>;
  altNames: Table<MAltName, [number, string]>;
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

// v3 adds daily collection-value snapshots. (Card condition is a new optional
// field on collection entries — non-indexed, so no store change needed.)
db.version(3).stores({
  valueHistory: "date",
});

// v4 adds per-card daily price points for owned/wishlisted cards.
db.version(4).stores({
  priceHistory: "[cardId+date], cardId",
});

// v5 adds the on-demand printing (card set) cache. (The printing chosen for a
// collection entry is a new optional field — non-indexed, no store change.)
db.version(5).stores({
  cardSets: "cardId",
});

// v6 adds the set catalogue + per-set contents (Sets browser) and the trade
// log. (Collection tags and OCG/Goat banlists are non-indexed field additions.)
db.version(6).stores({
  sets: "name, nameLower",
  setCards: "setName",
  trades: "id, date",
});

// v7 adds the global rarity/foil index (set code -> rarity), populated from the
// full card dump during a card sync. (The collection entry's scanned `edition`
// is a non-indexed field addition, so it needs no store change.)
db.version(7).stores({
  printingIndex: "[codeCanon+rarity], codeCanon, cardId",
});

// v8 indexes price points by date. Now that a sync snapshots *every* card's
// price (not just tracked ones), the table is large enough that pruning old
// points needs a range query rather than a full scan.
db.version(8).stores({
  priceHistory: "[cardId+date], cardId, date",
});

// v9 adds localized card names from downloadable language packs. (banMd /
// speedLimit / ypId from the data-pack sync are non-indexed field additions.)
db.version(9).stores({
  altNames: "[cardId+lang], lang, nameLower",
});

export async function getSyncMeta(key: string): Promise<string | null> {
  return (await db.syncMeta.get(key))?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await db.syncMeta.put({ key, value });
}
