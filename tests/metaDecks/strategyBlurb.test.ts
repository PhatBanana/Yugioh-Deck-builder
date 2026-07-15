import { describe, expect, it } from "vitest";
import { strategyBlurb } from "../../shared/metaDecks/strategy";

describe("strategyBlurb", () => {
  it("names the key cards in the strategy template", () => {
    const text = strategyBlurb("Combo", ["Aluber the Jester of Despia", "Branded Fusion"]);
    expect(text).toContain("Combo deck");
    expect(text).toContain("Aluber the Jester of Despia, Branded Fusion");
  });

  it("caps key cards at three and dedupes", () => {
    const text = strategyBlurb("Control", ["A", "A", "B", "C", "D"]);
    expect(text).toContain("A, B, C");
    expect(text).not.toContain("A, B, C, D");
  });

  it("falls back to a generic plan for unknown strategies", () => {
    const text = strategyBlurb(null, []);
    expect(text).toContain("key cards");
    expect(text).toContain("your boss monsters");
  });
});
