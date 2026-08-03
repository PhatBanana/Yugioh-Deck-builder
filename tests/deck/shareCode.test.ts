import { describe, expect, it } from "vitest";
import { decodeDeckCode, encodeDeckCode } from "../../shared/deck/shareCode";
import type { DeckCard } from "../../shared/deck/types";

const cards: DeckCard[] = [
  { cardId: 12345, quantity: 3, section: "main" },
  { cardId: 67890, quantity: 1, section: "main" },
  { cardId: 55555, quantity: 2, section: "extra" },
];

describe("encode/decode deck code", () => {
  it("round-trips a deck through a code", () => {
    const code = encodeDeckCode("My Deck", cards);
    const decoded = decodeDeckCode(code)!;
    expect(decoded.name).toBe("My Deck");
    expect(decoded.cards).toEqual(expect.arrayContaining(cards));
    expect(decoded.cards).toHaveLength(3);
  });

  it("preserves unicode names", () => {
    const code = encodeDeckCode("青眼の白龍 ⚡", cards);
    expect(decodeDeckCode(code)!.name).toBe("青眼の白龍 ⚡");
  });

  it("rejects codes without the version tag", () => {
    expect(decodeDeckCode("hello world")).toBeNull();
    expect(decodeDeckCode("")).toBeNull();
    expect(decodeDeckCode("YGO1|OnlyName")).toBeNull(); // no cards
  });

  it("clamps quantities and skips malformed tokens", () => {
    const decoded = decodeDeckCode("YGO1|X|M:111*9,abc*2,222*1")!;
    expect(decoded.cards).toEqual([
      { cardId: 111, quantity: 3, section: "main" }, // 9 clamped to 3
      { cardId: 222, quantity: 1, section: "main" },
    ]);
  });

  it("handles empty sections", () => {
    const code = encodeDeckCode("Solo", [{ cardId: 1, quantity: 1, section: "main" }]);
    const decoded = decodeDeckCode(code)!;
    expect(decoded.cards).toEqual([{ cardId: 1, quantity: 1, section: "main" }]);
  });
});
