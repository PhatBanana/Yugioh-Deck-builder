import type { DeckCard, DeckSection } from "@shared/deck/types";
import {
  SPEED_SIZES,
  STANDARD_SIZES,
  validateDeck,
  type DeckValidation,
} from "@shared/deck/validate";
import { serializeYdk } from "@shared/deck/ydk";
import { strategyBlurb } from "@shared/metaDecks/strategy";
import { uid } from "../lib/util";
import { db, type MCard, type MDeck } from "../db";

export interface DeckUsageEntry {
  id: string;
  name: string;
  era?: string | null;
  copies: number; // how many the deck runs (max across sections)
}

export interface CardUsage {
  meta: DeckUsageEntry[]; // cached meta decks that run this card
  mine: DeckUsageEntry[]; // the user's own saved decks that run it
}

// Which decks (meta + your own) use a given card. Powers the "used in decks"
// section of the card detail view.
export async function getCardUsage(cardId: number): Promise<CardUsage> {
  const [metaDecks, myDecks] = await Promise.all([db.metaDecks.toArray(), db.decks.toArray()]);
  const copiesIn = (cards: { cardId: number; quantity: number }[]) =>
    cards.filter((c) => c.cardId === cardId).reduce((n, c) => Math.max(n, c.quantity), 0);

  const meta = metaDecks
    .filter((d) => d.cards.some((c) => c.cardId === cardId))
    .map((d) => ({ id: d.id, name: d.name, era: d.era, copies: copiesIn(d.cards) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const mine = myDecks
    .filter((d) => d.cards.some((c) => c.cardId === cardId))
    .map((d) => ({ id: d.id, name: d.name, copies: copiesIn(d.cards) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { meta, mine };
}

export async function listDecks(): Promise<MDeck[]> {
  const decks = await db.decks.toArray();
  return decks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeck(id: string): Promise<MDeck | undefined> {
  return db.decks.get(id);
}

export async function createDeck(name: string): Promise<MDeck> {
  const deck: MDeck = {
    id: uid(),
    name: name.trim() || "New Deck",
    updatedAt: new Date().toISOString(),
    cards: [],
  };
  await db.decks.put(deck);
  return deck;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  await db.decks.update(id, { name: name.trim() || "Untitled", updatedAt: new Date().toISOString() });
}

export async function setDeckNotes(id: string, notes: string): Promise<void> {
  await db.decks.update(id, {
    notes: notes.trim() || undefined,
    updatedAt: new Date().toISOString(),
  });
}

// Persists the "starter" cards picked in the deck-odds analyzer. Not a deck
// edit, so it deliberately leaves `updatedAt` alone.
export async function setDeckStarters(id: string, starters: number[]): Promise<void> {
  await db.decks.update(id, { starters: starters.length > 0 ? starters : undefined });
}

export async function deleteDeck(id: string): Promise<void> {
  await db.decks.delete(id);
}

// Re-inserts a whole deck record (for undo after a delete).
export async function restoreDeck(deck: MDeck): Promise<void> {
  await db.decks.put(deck);
}

// Copies a deck into a new one named "… (copy)".
export async function duplicateDeck(id: string): Promise<MDeck | null> {
  const src = await db.decks.get(id);
  if (!src) return null;
  const copy: MDeck = {
    ...src,
    id: uid(),
    name: `${src.name} (copy)`,
    updatedAt: new Date().toISOString(),
  };
  await db.decks.put(copy);
  return copy;
}

// Card ids the deck runs more copies of than you own (summed across sections,
// which the 3-per-card limit keeps at ≤3). Powers "add missing to wishlist".
export async function deckMissingCardIds(deckId: string): Promise<number[]> {
  const deck = await db.decks.get(deckId);
  if (!deck) return [];
  const need = new Map<number, number>();
  for (const c of deck.cards) need.set(c.cardId, (need.get(c.cardId) ?? 0) + c.quantity);
  const ids = [...need.keys()];
  const owned = await db.collection.bulkGet(ids);
  return ids.filter((id, i) => (owned[i]?.quantity ?? 0) < (need.get(id) ?? 0));
}

export async function saveDeckFromYdk(name: string, cards: DeckCard[]): Promise<MDeck> {
  const deck: MDeck = {
    id: uid(),
    name: name.trim() || "Imported Deck",
    updatedAt: new Date().toISOString(),
    cards,
  };
  await db.decks.put(deck);
  return deck;
}

// Copies a cached meta deck into the user's editable Decks (deck builder),
// seeding the strategy notes with a generated game plan.
export async function saveMetaDeckAsDeck(metaDeckId: string): Promise<MDeck | null> {
  const meta = await db.metaDecks.get(metaDeckId);
  if (!meta) return null;
  const cards: DeckCard[] = meta.cards.map((c) => ({
    cardId: c.cardId,
    quantity: c.quantity,
    section: c.section,
  }));
  const deck = await saveDeckFromYdk(meta.name, cards);
  const keys = meta.cards.filter((c) => c.isKeyCard).map((c) => c.cardName);
  await setDeckNotes(deck.id, strategyBlurb(meta.strategy, keys));
  return (await db.decks.get(deck.id)) ?? deck;
}

// Sets the quantity of a card in a section (0 removes it). Copies in other
// sections are left alone.
export async function setDeckCard(
  deckId: string,
  cardId: number,
  section: DeckSection,
  quantity: number
): Promise<void> {
  const deck = await db.decks.get(deckId);
  if (!deck) return;
  const others = deck.cards.filter((c) => !(c.cardId === cardId && c.section === section));
  const next =
    quantity > 0
      ? [...others, { cardId, quantity: Math.min(3, quantity), section }]
      : others;
  await db.decks.update(deckId, { cards: next, updatedAt: new Date().toISOString() });
}

// ---- Enriched view for the editor (joins card data + owned + validation) ----

export interface EnrichedDeckCard extends DeckCard {
  name: string;
  img: string | null;
  banlist: string | null;
  owned: number; // copies owned in collection
  price: number | null;
  type: string;
}

// Which format validates the deck. OCG/Goat data arrives with a card re-sync;
// Master Duel and Speed Duel data come from the data-pack fetch. Until the
// data exists the fields are undefined and treated as unlimited.
//
// Master Duel checks card-pool membership only: the upstream data says which
// cards are in the game, but carries no MD Forbidden/Limited list, so copy
// limits aren't enforced for it (the UI says as much).
export type BanlistFormat = "tcg" | "ocg" | "goat" | "master" | "speed";

export interface EnrichedDeck {
  deck: MDeck;
  cards: EnrichedDeckCard[];
  validation: DeckValidation;
  ydkName: string;
  // True when the chosen non-TCG format has no banlist data locally yet.
  formatDataMissing: boolean;
}

function banFor(card: MCard | undefined, format: BanlistFormat): string | null {
  if (!card) return null;
  if (format === "ocg") return card.banOcg ?? null;
  if (format === "goat") return card.banGoat ?? null;
  if (format === "master") return card.banMd ?? null;
  if (format === "speed") return card.speedLimit ?? null;
  return card.banlist;
}

// Whether the chosen format's data simply hasn't been fetched yet (distinct
// from "every card is unlimited").
function formatDataAbsent(format: BanlistFormat, present: MCard[]): boolean {
  if (format === "tcg" || present.length === 0) return false;
  const field = (c: MCard) =>
    format === "ocg"
      ? c.banOcg
      : format === "goat"
        ? c.banGoat
        : format === "master"
          ? c.banMd
          : c.speedLimit;
  return present.every((c) => field(c) === undefined);
}

export async function enrichDeck(
  deck: MDeck,
  format: BanlistFormat = "tcg"
): Promise<EnrichedDeck> {
  const ids = deck.cards.map((c) => c.cardId);
  const [cards, coll] = await Promise.all([db.cards.bulkGet(ids), db.collection.bulkGet(ids)]);
  const enriched: EnrichedDeckCard[] = deck.cards.map((c, i) => ({
    ...c,
    name: cards[i]?.name ?? `#${c.cardId}`,
    img: cards[i]?.img ?? null,
    banlist: banFor(cards[i], format),
    owned: coll[i]?.quantity ?? 0,
    price: cards[i]?.price ?? null,
    type: cards[i]?.type ?? "",
  }));
  const present = cards.filter((c): c is MCard => !!c);
  const formatDataMissing = formatDataAbsent(format, present);
  enriched.sort((a, b) => a.name.localeCompare(b.name));
  const validation = validateDeck(
    enriched.map((c) => ({
      cardId: c.cardId,
      name: c.name,
      quantity: c.quantity,
      section: c.section,
      banlist: c.banlist,
    })),
    format === "speed" ? SPEED_SIZES : STANDARD_SIZES
  );
  // Master Duel and Speed Duel are pool-limited formats: a card with no entry
  // for the format simply doesn't exist there. Speed Duel's pool is ~1,200
  // cards; Master Duel omits a few hundred. (Speed Skill cards are out of
  // scope — they aren't in the card database at all.)
  if ((format === "speed" || format === "master") && !formatDataMissing) {
    const poolName = format === "speed" ? "the Speed Duel card pool" : "Master Duel";
    const seen = new Set<number>();
    deck.cards.forEach((_c, i) => {
      const card = cards[i];
      if (!card || seen.has(card.id)) return;
      const inPool = format === "speed" ? card.speedLimit !== undefined : card.banMd !== undefined;
      if (!inPool) {
        seen.add(card.id);
        validation.errors.push(`${card.name} isn't in ${poolName}.`);
      }
    });
    validation.legal = validation.errors.length === 0;
  }
  const ydkName = deck.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { deck, cards: enriched, validation, ydkName, formatDataMissing };
}

export function deckToYdk(deck: MDeck): string {
  return serializeYdk(deck.cards);
}
