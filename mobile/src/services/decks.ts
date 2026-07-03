import type { DeckCard, DeckSection } from "@shared/deck/types";
import { validateDeck, type DeckValidation } from "@shared/deck/validate";
import { serializeYdk } from "@shared/deck/ydk";
import { db, type MDeck } from "../db";

function uid(): string {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const enriched: EnrichedDeckCard[] = [];
  for (const c of deck.cards) {
    const card = await db.cards.get(c.cardId);
    const owned = (await db.collection.get(c.cardId))?.quantity ?? 0;
    enriched.push({
      ...c,
      name: card?.name ?? `#${c.cardId}`,
      img: card?.img ?? null,
      banlist: card?.banlist ?? null,
      owned,
    });
  }
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
