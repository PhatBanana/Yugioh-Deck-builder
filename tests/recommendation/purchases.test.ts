import { describe, expect, it } from "vitest";
import { rankPurchases } from "../../shared/recommendation/purchases";
import type { MetaDeck } from "../../shared/recommendation/types";

function req(
  cardId: number,
  cardName: string,
  quantity: number,
  isKeyCard: boolean,
  priceUsd: number | null = 1
) {
  return {
    cardId,
    cardName,
    quantity,
    section: "main" as const,
    isKeyCard,
    keyWeight: isKeyCard ? 1.0 : 0.3,
    priceUsd,
  };
}

describe("rankPurchases", () => {
  it("ranks a card shared across decks above a single-deck card", () => {
    const decks: MetaDeck[] = [
      { id: "a", name: "Deck A", archetype: "A", cards: [req(1, "Staple", 3, false), req(2, "A Boss", 1, true)] },
      { id: "b", name: "Deck B", archetype: "B", cards: [req(1, "Staple", 3, false), req(3, "B Boss", 1, true)] },
    ];
    const out = rankPurchases(decks, {}, { limit: 10 });
    const staple = out.find((p) => p.cardId === 1)!;
    expect(staple.decksHelped).toBe(2);
    // Staple appears in 2 decks (3 copies each) — should outrank a 1-of boss.
    expect(out[0].cardId).toBe(1);
  });

  it("excludes cards you already fully own", () => {
    const decks: MetaDeck[] = [
      { id: "a", name: "A", archetype: "A", cards: [req(1, "Owned", 3, true), req(2, "Missing", 1, true)] },
    ];
    const out = rankPurchases(decks, { 1: 3 }, {});
    expect(out.find((p) => p.cardId === 1)).toBeUndefined();
    expect(out.find((p) => p.cardId === 2)).toBeDefined();
  });

  it("reports the price and example decks for a suggestion", () => {
    const decks: MetaDeck[] = [
      { id: "a", name: "Snake-Eye", archetype: "Snake-Eye", cards: [req(9, "Original Sinful Spoils", 1, true, 12.5)] },
    ];
    const [top] = rankPurchases(decks, {});
    expect(top.priceUsd).toBe(12.5);
    expect(top.topDeckNames).toContain("Snake-Eye");
  });

  it("ignores side-deck requirements", () => {
    const decks: MetaDeck[] = [
      {
        id: "a",
        name: "A",
        archetype: "A",
        cards: [
          { cardId: 5, cardName: "Side Tech", quantity: 3, section: "side", isKeyCard: true, keyWeight: 1, priceUsd: 1 },
        ],
      },
    ];
    expect(rankPurchases(decks, {})).toHaveLength(0);
  });
});
