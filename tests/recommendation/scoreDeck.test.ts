import { describe, expect, it } from "vitest";
import { scoreDeck } from "../../shared/recommendation/scoreDeck";
import { recommendTopDecks } from "../../shared/recommendation/recommend";
import type { MetaDeck } from "../../shared/recommendation/types";

function makeDeck(overrides: Partial<MetaDeck> = {}): MetaDeck {
  return {
    id: "test-deck",
    name: "Test Deck",
    archetype: "Test",
    cards: [
      { cardId: 1, cardName: "Key Card A", quantity: 3, section: "main", isKeyCard: true, keyWeight: 1.0 },
      { cardId: 2, cardName: "Key Card B", quantity: 1, section: "main", isKeyCard: true, keyWeight: 1.0 },
      { cardId: 3, cardName: "Staple Hand Trap", quantity: 3, section: "main", isKeyCard: false, keyWeight: 0.3 },
      { cardId: 4, cardName: "Extra Boss", quantity: 1, section: "extra", isKeyCard: false, keyWeight: 0.3 },
      { cardId: 5, cardName: "Side Tech", quantity: 2, section: "side", isKeyCard: false, keyWeight: 0.3 },
    ],
    ...overrides,
  };
}

describe("scoreDeck", () => {
  it("scores 1.0 when every needed card is fully owned", () => {
    const deck = makeDeck();
    const owned = { 1: 3, 2: 1, 3: 3, 4: 1 };
    const result = scoreDeck(deck, owned);
    expect(result.completionScore).toBeCloseTo(1);
    expect(result.rawCompletionPct).toBeCloseTo(1);
    expect(result.missingCards).toHaveLength(0);
  });

  it("scores 0 when nothing is owned", () => {
    const deck = makeDeck();
    const result = scoreDeck(deck, {});
    expect(result.completionScore).toBe(0);
    expect(result.missingCards.length).toBeGreaterThan(0);
  });

  it("weights key cards more than generic staples", () => {
    const deck = makeDeck();
    // Own only the key cards (4 copies out of 8 main+extra needed = 50% raw)
    const ownedKeyOnly = scoreDeck(deck, { 1: 3, 2: 1 });
    // Own only the non-key staples (4 copies out of 8 main+extra needed = 50% raw)
    const ownedStaplesOnly = scoreDeck(deck, { 3: 3, 4: 1 });

    expect(ownedKeyOnly.rawCompletionPct).toBeCloseTo(ownedStaplesOnly.rawCompletionPct);
    expect(ownedKeyOnly.completionScore).toBeGreaterThan(ownedStaplesOnly.completionScore);
  });

  it("caps credited ownership at the required quantity (extra copies don't help)", () => {
    const deck = makeDeck();
    const result = scoreDeck(deck, { 2: 5 }); // only need 1, own 5
    const keyCardB = result.missingCards.find((c) => c.cardId === 2);
    expect(keyCardB).toBeUndefined(); // fully satisfied, not missing
    expect(result.totalCardsOwned).toBe(1); // capped, not 5
  });

  it("excludes side deck from scoring by default", () => {
    const deck = makeDeck();
    const withoutSide = scoreDeck(deck, {});
    expect(withoutSide.totalCardsNeeded).toBe(8); // 3+1+3+1, not +2 side
    expect(withoutSide.missingCards.every((c) => c.section !== "side")).toBe(true);
  });

  it("includes side deck when includeSide is true", () => {
    const deck = makeDeck();
    const withSide = scoreDeck(deck, {}, { includeSide: true });
    expect(withSide.totalCardsNeeded).toBe(10);
    expect(withSide.missingCards.some((c) => c.section === "side")).toBe(true);
  });

  it("sorts missing cards key-first, then by biggest gap", () => {
    const deck = makeDeck();
    const result = scoreDeck(deck, {});
    // Key cards (cardId 1, 2) should come before non-key (3, 4)
    const keyIndices = result.missingCards
      .map((c, i) => (c.isKeyCard ? i : -1))
      .filter((i) => i >= 0);
    const nonKeyIndices = result.missingCards
      .map((c, i) => (!c.isKeyCard ? i : -1))
      .filter((i) => i >= 0);
    expect(Math.max(...keyIndices)).toBeLessThan(Math.min(...nonKeyIndices));
    // Within key cards, cardId 1 (missing 3) should come before cardId 2 (missing 1)
    expect(result.missingCards[0].cardId).toBe(1);
  });
});

describe("recommendTopDecks", () => {
  it("returns decks sorted by completionScore descending, limited to `limit`", () => {
    const decks = [
      makeDeck({ id: "low", name: "Low", archetype: "Low" }),
      makeDeck({ id: "high", name: "High", archetype: "High" }),
      makeDeck({ id: "mid", name: "Mid", archetype: "Mid" }),
    ];
    // "high" owns everything, "mid" owns half, "low" owns nothing
    const owned = { 1: 3, 2: 1, 3: 3, 4: 1 };
    const results = recommendTopDecks(decks, owned, { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].deckId).toBe("high");
  });

  it("is deterministic when all decks tie at 0 completion", () => {
    const decks = [makeDeck({ id: "b", name: "B Deck" }), makeDeck({ id: "a", name: "A Deck" })];
    const results = recommendTopDecks(decks, {});
    expect(results[0].deckId).toBe("a"); // alphabetical tiebreak
  });

  it("dedupes variants of the same archetype, keeping the best-scoring one", () => {
    const decks = [
      makeDeck({ id: "sky-striker-1", name: "Sky Striker", archetype: "Sky Striker" }),
      makeDeck({
        id: "sky-striker-2",
        name: "Sky Striker",
        archetype: "Sky Striker",
        // Variant needing an extra unowned card scores lower
        cards: [
          ...makeDeck().cards,
          { cardId: 99, cardName: "Extra Tech", quantity: 3, section: "main", isKeyCard: true, keyWeight: 1.0 },
        ],
      }),
      makeDeck({ id: "other", name: "Other Deck", archetype: "Other" }),
    ];
    const owned = { 1: 3, 2: 1 };
    const results = recommendTopDecks(decks, owned, { limit: 5 });
    // Ties break alphabetically ("Other Deck" < "Sky Striker"); the lower-scoring
    // sky-striker-2 variant must be dropped entirely.
    expect(results.map((r) => r.deckId)).toEqual(["other", "sky-striker-1"]);
  });

  it("dedupes by name when archetype is null", () => {
    const decks = [
      makeDeck({ id: "v1", name: "Branded Despia", archetype: null }),
      makeDeck({ id: "v2", name: "branded despia", archetype: null }),
    ];
    const results = recommendTopDecks(decks, {});
    expect(results).toHaveLength(1);
  });
});
