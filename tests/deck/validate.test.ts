import { describe, expect, it } from "vitest";
import { validateDeck, type ValidatableCard } from "../../shared/deck/validate";

function card(over: Partial<ValidatableCard>): ValidatableCard {
  return { cardId: 1, name: "Card", quantity: 1, section: "main", banlist: null, ...over };
}

describe("validateDeck", () => {
  // 40 legal main-deck cards: 13 distinct cards at x3 (=39) + 1 at x1.
  const legalMain = (): ValidatableCard[] => {
    const cards: ValidatableCard[] = [];
    for (let i = 1; i <= 13; i++) cards.push(card({ cardId: i, quantity: 3 }));
    cards.push(card({ cardId: 14, quantity: 1 }));
    return cards;
  };

  it("accepts a legal 40-card main deck", () => {
    const v = validateDeck(legalMain());
    expect(v.mainCount).toBe(40);
    expect(v.legal).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it("flags a too-small main deck", () => {
    const cards = legalMain().filter((c) => c.cardId !== 14); // 39 cards
    const v = validateDeck(cards);
    expect(v.legal).toBe(false);
    expect(v.errors[0]).toMatch(/at least 40/);
  });

  it("flags an oversized extra deck", () => {
    const cards = [
      ...legalMain(),
      // 16 distinct extra-deck cards (1-of each) = 16 > 15
      ...Array.from({ length: 16 }, (_, i) => card({ cardId: 100 + i, quantity: 1, section: "extra" })),
    ];
    const v = validateDeck(cards);
    expect(v.errors.some((e) => /Extra Deck/.test(e))).toBe(true);
  });

  it("enforces copy limits across sections combined", () => {
    // 2 in main + 2 in side = 4 copies of the same card
    const cards = [
      card({ cardId: 1, name: "Staple", quantity: 2 }),
      card({ cardId: 1, name: "Staple", quantity: 2, section: "side" }),
      card({ cardId: 2, quantity: 38 }),
    ];
    const v = validateDeck(cards);
    expect(v.errors.some((e) => /Staple.*exceeds the limit of 3/.test(e))).toBe(true);
  });

  it("respects banlist limits (Limited = 1)", () => {
    const cards = [
      card({ cardId: 1, name: "Called by the Grave", quantity: 2, banlist: "Limited" }),
      card({ cardId: 2, quantity: 38 }),
    ];
    const v = validateDeck(cards);
    expect(v.errors.some((e) => /Called by the Grave.*limit of 1/.test(e))).toBe(true);
  });

  it("marks Forbidden cards", () => {
    const cards = [
      card({ cardId: 1, name: "Banned Guy", quantity: 1, banlist: "Banned" }),
      card({ cardId: 2, quantity: 40 }),
    ];
    const v = validateDeck(cards);
    expect(v.errors.some((e) => /Banned Guy is Forbidden/.test(e))).toBe(true);
  });
});
