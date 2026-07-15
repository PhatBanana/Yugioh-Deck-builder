import { describe, expect, it } from "vitest";
import { computeDeckStats } from "../../shared/deck/stats";
import { buildPile, drawHand } from "../../shared/deck/handSim";

describe("computeDeckStats", () => {
  it("counts main-deck monsters/spells/traps by copies", () => {
    const stats = computeDeckStats([
      { type: "Effect Monster", quantity: 3, section: "main", price: 2 },
      { type: "Normal Monster", quantity: 2, section: "main", price: 1 },
      { type: "Spell Card", quantity: 2, section: "main", price: 0.5 },
      { type: "Trap Card", quantity: 1, section: "main", price: null },
      { type: "Fusion Monster", quantity: 2, section: "extra", price: 4 },
    ]);
    expect(stats.monsters).toBe(5);
    expect(stats.spells).toBe(2);
    expect(stats.traps).toBe(1);
    // Price spans all sections: 3*2 + 2*1 + 2*0.5 + 2*4 = 17
    expect(stats.priceUsd).toBeCloseTo(17);
    expect(stats.unpricedCount).toBe(1);
  });

  it("handles an empty deck", () => {
    expect(computeDeckStats([])).toEqual({
      monsters: 0,
      spells: 0,
      traps: 0,
      priceUsd: 0,
      unpricedCount: 0,
    });
  });
});

describe("hand simulator", () => {
  const deck = [
    { cardId: 1, quantity: 3 },
    { cardId: 2, quantity: 2 },
    { cardId: 3, quantity: 1 },
  ];

  it("builds one pile entry per copy", () => {
    expect(buildPile(deck)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it("draws the requested hand size without replacement", () => {
    const hand = drawHand(buildPile(deck), 5);
    expect(hand).toHaveLength(5);
    // Never more copies of a card than the deck contains.
    for (const id of [1, 2, 3]) {
      const copies = hand.filter((h) => h === id).length;
      const max = deck.find((d) => d.cardId === id)!.quantity;
      expect(copies).toBeLessThanOrEqual(max);
    }
  });

  it("caps at the pile size", () => {
    expect(drawHand(buildPile(deck), 40)).toHaveLength(6);
  });

  it("is deterministic with an injected rng", () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const a = drawHand(buildPile(deck), 5, rng);
    seed = 42;
    const b = drawHand(buildPile(deck), 5, rng);
    expect(a).toEqual(b);
  });
});
