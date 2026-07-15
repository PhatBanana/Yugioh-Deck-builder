import type { DeckSection } from "./types";

export interface DeckStatsCard {
  type: string; // YGOPRODeck type string, e.g. "Effect Monster", "Spell Card"
  quantity: number;
  section: DeckSection;
  price?: number | null;
}

export interface DeckStats {
  // Main-deck composition (the classic monster/spell/trap ratio).
  monsters: number;
  spells: number;
  traps: number;
  // Estimated cost of every card in the deck (all sections), copies included.
  priceUsd: number;
  unpricedCount: number; // copies with no known price
}

export function computeDeckStats(cards: DeckStatsCard[]): DeckStats {
  const stats: DeckStats = { monsters: 0, spells: 0, traps: 0, priceUsd: 0, unpricedCount: 0 };
  for (const c of cards) {
    if (c.section === "main") {
      if (c.type.includes("Monster")) stats.monsters += c.quantity;
      else if (c.type.includes("Spell")) stats.spells += c.quantity;
      else if (c.type.includes("Trap")) stats.traps += c.quantity;
    }
    if (c.price != null) stats.priceUsd += c.price * c.quantity;
    else stats.unpricedCount += c.quantity;
  }
  return stats;
}
