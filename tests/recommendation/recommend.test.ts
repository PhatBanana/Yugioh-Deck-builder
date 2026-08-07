import { describe, expect, it } from "vitest";
import { recommendTopDecks } from "../../shared/recommendation/recommend";
import type { DeckCardRequirement, MetaDeck, OwnedCollection } from "../../shared/recommendation/types";

const req = (
  cardId: number,
  quantity: number,
  over: Partial<DeckCardRequirement> = {}
): DeckCardRequirement => ({
  cardId,
  cardName: `Card ${cardId}`,
  quantity,
  section: "main",
  isKeyCard: false,
  keyWeight: 1,
  ...over,
});

const deck = (id: string, name: string, cards: DeckCardRequirement[], archetype: string | null = null): MetaDeck => ({
  id,
  name,
  archetype,
  cards,
});

describe("recommendTopDecks", () => {
  it("ranks decks by weighted completion of what you own", () => {
    const decks = [
      deck("a", "Nothing Owned", [req(10, 3), req(11, 3)]),
      deck("b", "Half Owned", [req(1, 3), req(20, 3)]),
      deck("c", "Fully Owned", [req(1, 3), req(2, 3)]),
    ];
    const owned: OwnedCollection = { 1: 3, 2: 3 };
    const recs = recommendTopDecks(decks, owned);
    expect(recs.map((r) => r.deckId)).toEqual(["c", "b", "a"]);
    expect(recs[0].completionScore).toBe(1);
    expect(recs[1].completionScore).toBeCloseTo(0.5, 10);
    expect(recs[2].completionScore).toBe(0);
  });

  it("weights key cards: owning them ranks a deck above equal raw ownership", () => {
    // Both decks: 6 cards, you own 3. In "keys" you own the key cards
    // (weight 3); in "filler" you own the filler.
    const keys = deck("k", "Keys Owned", [
      req(1, 3, { isKeyCard: true, keyWeight: 3 }),
      req(30, 3),
    ]);
    const filler = deck("f", "Filler Owned", [
      req(31, 3, { isKeyCard: true, keyWeight: 3 }),
      req(2, 3),
    ]);
    const owned: OwnedCollection = { 1: 3, 2: 3 };
    const recs = recommendTopDecks([filler, keys], owned);
    expect(recs[0].deckId).toBe("k");
    expect(recs[0].completionScore).toBeGreaterThan(recs[1].completionScore);
  });

  it("dedupes variants of the same archetype, keeping the best-scoring one", () => {
    const v1 = deck("v1", "Sky Striker (1st)", [req(1, 3)], "Sky Striker");
    const v2 = deck("v2", "Sky Striker (2nd)", [req(40, 3)], "Sky Striker");
    const other = deck("o", "Other Deck", [req(41, 3)], "Other");
    const recs = recommendTopDecks([v2, v1, other], { 1: 3 });
    expect(recs.map((r) => r.deckId)).toEqual(["v1", "o"]);
  });

  it("excludes the side deck unless asked, and caps at the limit", () => {
    const d = deck("s", "Sided", [req(1, 3), req(50, 3, { section: "side" })]);
    const owned: OwnedCollection = { 1: 3 };
    // Side excluded (default): main is fully owned.
    expect(recommendTopDecks([d], owned)[0].completionScore).toBe(1);
    // Side included: the unowned side cards drag completion down.
    expect(recommendTopDecks([d], owned, { includeSide: true })[0].completionScore).toBeCloseTo(0.5, 10);

    const many = Array.from({ length: 8 }, (_, i) => deck(`d${i}`, `Deck ${i}`, [req(100 + i, 3)], `A${i}`));
    expect(recommendTopDecks(many, {}, { limit: 3 })).toHaveLength(3);
  });

  it("reports missing cards with cost, key cards first", () => {
    const d = deck("m", "Missing Stuff", [
      req(1, 3), // owned
      req(60, 2, { priceUsd: 10 }),
      req(61, 3, { isKeyCard: true, keyWeight: 3, priceUsd: null }),
    ]);
    const [rec] = recommendTopDecks([d], { 1: 3 });
    expect(rec.missingCards.map((m) => m.cardId)).toEqual([61, 60]); // key first
    expect(rec.missingCards[1].missingCostUsd).toBe(20); // 2 × $10
    expect(rec.missingCostUsd).toBe(20);
    expect(rec.missingCostUnpricedCount).toBe(1); // the unpriced key card
  });
});
