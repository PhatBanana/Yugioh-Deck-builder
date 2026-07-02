export type DeckSection = "main" | "extra" | "side";

export interface OwnedCollection {
  [cardId: number]: number;
}

export interface DeckCardRequirement {
  cardId: number;
  cardName: string;
  quantity: number;
  section: DeckSection;
  isKeyCard: boolean;
  keyWeight: number;
  priceUsd?: number | null;
}

export interface MetaDeck {
  id: string;
  name: string;
  archetype: string | null;
  cards: DeckCardRequirement[];
}

export interface MissingCard {
  cardId: number;
  cardName: string;
  neededQuantity: number;
  ownedQuantity: number;
  missingQuantity: number;
  isKeyCard: boolean;
  section: DeckSection;
  priceUsd: number | null;
  // priceUsd * missingQuantity, null when the card has no known price
  missingCostUsd: number | null;
}

export interface DeckRecommendation {
  deckId: string;
  deckName: string;
  archetype: string | null;
  completionScore: number;
  rawCompletionPct: number;
  totalCardsNeeded: number;
  totalCardsOwned: number;
  missingCards: MissingCard[];
  // Sum of known missing-card costs; cards without price data are excluded
  // and counted in missingCostUnpricedCount.
  missingCostUsd: number;
  missingCostUnpricedCount: number;
}

export interface RecommendOptions {
  limit?: number;
  includeSide?: boolean;
}
