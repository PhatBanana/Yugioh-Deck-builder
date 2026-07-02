import type { DeckRecommendation, MetaDeck, MissingCard, OwnedCollection } from "./types";

export function scoreDeck(
  deck: MetaDeck,
  owned: OwnedCollection,
  options: { includeSide?: boolean } = {}
): DeckRecommendation {
  const includeSide = options.includeSide ?? false;
  const relevantCards = deck.cards.filter((c) => includeSide || c.section !== "side");

  let weightedNeeded = 0;
  let weightedOwned = 0;
  let rawNeeded = 0;
  let rawOwned = 0;
  const missingCards: MissingCard[] = [];

  for (const req of relevantCards) {
    const ownedQty = Math.min(owned[req.cardId] ?? 0, req.quantity);
    const weight = req.keyWeight;

    weightedNeeded += req.quantity * weight;
    weightedOwned += ownedQty * weight;
    rawNeeded += req.quantity;
    rawOwned += ownedQty;

    const missingQuantity = req.quantity - ownedQty;
    if (missingQuantity > 0) {
      const priceUsd = req.priceUsd ?? null;
      missingCards.push({
        cardId: req.cardId,
        cardName: req.cardName,
        neededQuantity: req.quantity,
        ownedQuantity: owned[req.cardId] ?? 0,
        missingQuantity,
        isKeyCard: req.isKeyCard,
        section: req.section,
        priceUsd,
        missingCostUsd: priceUsd != null ? priceUsd * missingQuantity : null,
      });
    }
  }

  missingCards.sort((a, b) => {
    if (a.isKeyCard !== b.isKeyCard) return a.isKeyCard ? -1 : 1;
    return b.missingQuantity - a.missingQuantity;
  });

  return {
    deckId: deck.id,
    deckName: deck.name,
    archetype: deck.archetype,
    completionScore: weightedNeeded > 0 ? weightedOwned / weightedNeeded : 0,
    rawCompletionPct: rawNeeded > 0 ? rawOwned / rawNeeded : 0,
    totalCardsNeeded: rawNeeded,
    totalCardsOwned: rawOwned,
    missingCards,
    missingCostUsd: missingCards.reduce((sum, c) => sum + (c.missingCostUsd ?? 0), 0),
    missingCostUnpricedCount: missingCards.filter((c) => c.missingCostUsd == null).length,
  };
}
