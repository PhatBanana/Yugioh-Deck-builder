import { describe, expect, it } from "vitest";
import { buildPile, drawHand } from "../../shared/deck/handSim";

// Deterministic RNG (mulberry32) so draws are reproducible.
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("buildPile", () => {
  it("expands each card into one entry per copy", () => {
    const pile = buildPile([
      { cardId: 1, quantity: 3 },
      { cardId: 2, quantity: 1 },
    ]);
    expect(pile).toHaveLength(4);
    expect(pile.filter((id) => id === 1)).toHaveLength(3);
    expect(pile.filter((id) => id === 2)).toHaveLength(1);
  });

  it("returns an empty pile for an empty deck", () => {
    expect(buildPile([])).toEqual([]);
  });
});

describe("drawHand", () => {
  const pile = buildPile([
    { cardId: 1, quantity: 3 },
    { cardId: 2, quantity: 3 },
    { cardId: 3, quantity: 34 },
  ]); // a legal 40-card deck shape

  it("draws exactly n cards without replacement", () => {
    const hand = drawHand(pile, 5, seeded(1));
    expect(hand).toHaveLength(5);
    // No card id can appear more often than the deck runs copies of it.
    for (const id of new Set(hand)) {
      const copies = pile.filter((p) => p === id).length;
      expect(hand.filter((h) => h === id).length).toBeLessThanOrEqual(copies);
    }
  });

  it("caps the draw at the pile size and leaves the input untouched", () => {
    const tiny = [1, 2, 3];
    const before = [...tiny];
    expect(drawHand(tiny, 10, seeded(2))).toHaveLength(3);
    expect(tiny).toEqual(before); // no mutation of the caller's pile
  });

  it("draws every card with equal probability (no position bias)", () => {
    // The bias this guards against: a partial Fisher–Yates that picks
    // j from the full range every iteration (instead of i..end) skews
    // early positions. Draw 1 card from [0..9] many times: each id
    // should land near 10%.
    const ids = Array.from({ length: 10 }, (_, i) => i);
    const rand = seeded(42);
    const counts = new Array(10).fill(0);
    const trials = 20000;
    for (let t = 0; t < trials; t++) {
      counts[drawHand(ids, 1, rand)[0]]++;
    }
    for (const c of counts) {
      expect(c / trials).toBeGreaterThan(0.08);
      expect(c / trials).toBeLessThan(0.12);
    }
  });

  it("full-deck draws are a permutation, uniformly shuffled at the top", () => {
    // Drawing the whole pile must yield every card exactly once, and the
    // first position should be ~uniform across many shuffles.
    const ids = [1, 2, 3, 4, 5];
    const rand = seeded(7);
    const firstCounts = new Map<number, number>();
    const trials = 10000;
    for (let t = 0; t < trials; t++) {
      const hand = drawHand(ids, 5, rand);
      expect([...hand].sort()).toEqual([1, 2, 3, 4, 5]);
      firstCounts.set(hand[0], (firstCounts.get(hand[0]) ?? 0) + 1);
    }
    for (const id of ids) {
      const share = (firstCounts.get(id) ?? 0) / trials;
      expect(share).toBeGreaterThan(0.17);
      expect(share).toBeLessThan(0.23);
    }
  });
});
