import { describe, expect, it } from "vitest";
import { parseYdk, serializeYdk } from "../../shared/deck/ydk";
import type { DeckCard } from "../../shared/deck/types";

const deck: DeckCard[] = [
  { cardId: 46986414, quantity: 3, section: "main" },
  { cardId: 89631139, quantity: 1, section: "main" },
  { cardId: 10045474, quantity: 2, section: "extra" },
  { cardId: 14558127, quantity: 2, section: "side" },
];

describe("serializeYdk", () => {
  it("writes section headers and one line per copy", () => {
    const out = serializeYdk(deck);
    expect(out).toContain("#main");
    expect(out).toContain("#extra");
    expect(out).toContain("!side");
    // 3 copies of Dark Magician => three 46986414 lines
    expect(out.split("\n").filter((l) => l === "46986414")).toHaveLength(3);
  });
});

describe("parseYdk", () => {
  it("round-trips a deck through serialize -> parse", () => {
    const parsed = parseYdk(serializeYdk(deck));
    // Order-independent comparison
    const norm = (d: DeckCard[]) =>
      [...d].sort((a, b) => a.section.localeCompare(b.section) || a.cardId - b.cardId);
    expect(norm(parsed)).toEqual(norm(deck));
  });

  it("aggregates repeated ids per section and skips comments", () => {
    const ydk = "#created by tool\n#main\n46986414\n46986414\n#extra\n10045474\n!side";
    expect(parseYdk(ydk)).toEqual([
      { cardId: 46986414, quantity: 2, section: "main" },
      { cardId: 10045474, quantity: 1, section: "extra" },
    ]);
  });

  it("ignores ids appearing before any section header", () => {
    expect(parseYdk("12345678\n#main\n46986414")).toEqual([
      { cardId: 46986414, quantity: 1, section: "main" },
    ]);
  });
});
