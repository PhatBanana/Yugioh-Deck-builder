import { scoreDeck } from "./scoreDeck";
import type { MetaDeck, OwnedCollection } from "./types";

export interface PurchaseSuggestion {
  cardId: number;
  cardName: string;
  priceUsd: number | null;
  benefit: number; // weighted score — higher unlocks more/closer decks
  decksHelped: number; // number of distinct decks this card advances
  topDeckNames: string[]; // a few example decks it helps
}

// "What to buy next": ranks cards you don't fully own by how much overall
// meta-deck progress acquiring them would unlock. A card missing from many
// decks (staples) or from decks you're close to finishing scores highest, so
// a single purchase moves you as far as possible. Key/archetype cards count
// more than generic filler (via keyWeight), and decks you're near completing
// are weighted up so it favors "one more card and this deck is done".
export function rankPurchases(
  decks: MetaDeck[],
  owned: OwnedCollection,
  options: { limit?: number } = {}
): PurchaseSuggestion[] {
  const limit = options.limit ?? 10;

  interface Acc {
    cardId: number;
    cardName: string;
    priceUsd: number | null;
    benefit: number;
    decks: Set<string>;
    deckNames: string[];
  }
  const byCard = new Map<number, Acc>();

  for (const deck of decks) {
    const closeness = 0.5 + 0.5 * scoreDeck(deck, owned).completionScore;
    for (const req of deck.cards) {
      if (req.section === "side") continue;
      const ownedQty = Math.min(owned[req.cardId] ?? 0, req.quantity);
      const missing = req.quantity - ownedQty;
      if (missing <= 0) continue;

      const gain = req.keyWeight * missing * closeness;
      const acc =
        byCard.get(req.cardId) ??
        {
          cardId: req.cardId,
          cardName: req.cardName,
          priceUsd: req.priceUsd ?? null,
          benefit: 0,
          decks: new Set<string>(),
          deckNames: [],
        };
      acc.benefit += gain;
      if (!acc.decks.has(deck.name)) {
        acc.decks.add(deck.name);
        if (acc.deckNames.length < 3) acc.deckNames.push(deck.name);
      }
      if (acc.priceUsd == null && req.priceUsd != null) acc.priceUsd = req.priceUsd;
      byCard.set(req.cardId, acc);
    }
  }

  return [...byCard.values()]
    .sort((a, b) => {
      if (b.benefit !== a.benefit) return b.benefit - a.benefit;
      // Tie-break: cheaper first (better value), then name for determinism.
      const pa = a.priceUsd ?? Infinity;
      const pb = b.priceUsd ?? Infinity;
      if (pa !== pb) return pa - pb;
      return a.cardName.localeCompare(b.cardName);
    })
    .slice(0, limit)
    .map((a) => ({
      cardId: a.cardId,
      cardName: a.cardName,
      priceUsd: a.priceUsd,
      benefit: a.benefit,
      decksHelped: a.decks.size,
      topDeckNames: a.deckNames,
    }));
}
