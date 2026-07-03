import { db } from "../db";

export interface ImportSourceResult {
  metaDecks: { id: string; name: string; cardCount: number }[];
  archetypes: { name: string; cardCount: number }[];
}

// Searches offline against the local catalog + cached meta decks. Returns
// cached tournament decks (exact lists) and archetypes (all support cards)
// whose name contains the query — e.g. "Dark Magician" -> the archetype with
// every Dark Magician card.
export async function searchImportSources(query: string): Promise<ImportSourceResult> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { metaDecks: [], archetypes: [] };

  const metaDecks = (await db.metaDecks.toArray())
    .filter((d) => d.name.toLowerCase().includes(q))
    .map((d) => ({
      id: d.id,
      name: d.name,
      cardCount: new Set(d.cards.map((c) => c.cardId)).size,
    }))
    .slice(0, 10);

  const counts = new Map<string, number>();
  await db.cards.each((c) => {
    if (c.archetype && c.archetype.toLowerCase().includes(q)) {
      counts.set(c.archetype, (counts.get(c.archetype) ?? 0) + 1);
    }
  });
  const archetypes = [...counts.entries()]
    .map(([name, cardCount]) => ({ name, cardCount }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);

  return { metaDecks, archetypes };
}

export interface ImportCard {
  cardId: number;
  name: string;
  img: string | null;
  price: number | null;
  banlist: string | null;
  suggestedQty: number; // 3 for archetype cards; the deck's count for meta decks
}

export async function getArchetypeCards(archetype: string): Promise<ImportCard[]> {
  const cards = await db.cards.where("archetype").equals(archetype).toArray();
  cards.sort((a, b) => a.name.localeCompare(b.name));
  return cards.map((c) => ({
    cardId: c.id,
    name: c.name,
    img: c.img,
    price: c.price,
    banlist: c.banlist,
    suggestedQty: 3,
  }));
}

export async function getMetaDeckCards(deckId: string): Promise<ImportCard[]> {
  const deck = await db.metaDecks.get(deckId);
  if (!deck) return [];
  // A card can appear in multiple sections; keep the highest required count.
  const byId = new Map<number, number>();
  for (const c of deck.cards) {
    byId.set(c.cardId, Math.max(byId.get(c.cardId) ?? 0, c.quantity));
  }
  const out: ImportCard[] = [];
  for (const [cardId, qty] of byId) {
    const card = await db.cards.get(cardId);
    out.push({
      cardId,
      name: card?.name ?? `#${cardId}`,
      img: card?.img ?? null,
      price: card?.price ?? null,
      banlist: card?.banlist ?? null,
      suggestedQty: qty,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
