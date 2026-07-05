import type { DeckCard, DeckSection } from "@shared/deck/types";
import { validateDeck, type DeckValidation } from "@shared/deck/validate";
import { serializeYdk } from "@shared/deck/ydk";
import { db, type MDeck } from "../db";

function uid(): string {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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

export async function deleteDeck(id: string): Promise<void> {
  await db.decks.delete(id);
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

// Copies a cached meta deck into the user's editable Decks (deck builder).
export async function saveMetaDeckAsDeck(metaDeckId: string): Promise<MDeck | null> {
  const meta = await db.metaDecks.get(metaDeckId);
  if (!meta) return null;
  const cards: DeckCard[] = meta.cards.map((c) => ({
    cardId: c.cardId,
    quantity: c.quantity,
    section: c.section,
  }));
  return saveDeckFromYdk(meta.name, cards);
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
}

export interface EnrichedDeck {
  deck: MDeck;
  cards: EnrichedDeckCard[];
  validation: DeckValidation;
  ydkName: string;
}

export async function enrichDeck(deck: MDeck): Promise<EnrichedDeck> {
  const ids = deck.cards.map((c) => c.cardId);
  const [cards, coll] = await Promise.all([db.cards.bulkGet(ids), db.collection.bulkGet(ids)]);
  const enriched: EnrichedDeckCard[] = deck.cards.map((c, i) => ({
    ...c,
    name: cards[i]?.name ?? `#${c.cardId}`,
    img: cards[i]?.img ?? null,
    banlist: cards[i]?.banlist ?? null,
    owned: coll[i]?.quantity ?? 0,
  }));
  enriched.sort((a, b) => a.name.localeCompare(b.name));
  const validation = validateDeck(
    enriched.map((c) => ({
      cardId: c.cardId,
      name: c.name,
      quantity: c.quantity,
      section: c.section,
      banlist: c.banlist,
    }))
  );
  const ydkName = deck.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { deck, cards: enriched, validation, ydkName };
}

export function deckToYdk(deck: MDeck): string {
  return serializeYdk(deck.cards);
}
