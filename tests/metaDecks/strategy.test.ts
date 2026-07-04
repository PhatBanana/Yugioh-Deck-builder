import { describe, expect, it } from "vitest";
import {
  classifyStrategy,
  strategyFromName,
  type StrategyCardInfo,
} from "../../shared/metaDecks/strategy";

describe("strategyFromName", () => {
  it("detects explicit style words in titles", () => {
    expect(strategyFromName("Goat Format - Burn")).toBe("Burn");
    expect(strategyFromName("Goat Control")).toBe("Control");
    expect(strategyFromName("Exodia FTK")).toBe("FTK/OTK");
    expect(strategyFromName("Monarch Stun")).toBe("Stall");
  });

  it("no longer maps the noisy 'Beatdown'/'Beats' to Aggro", () => {
    expect(strategyFromName("Six Samurai Beatdown")).toBeNull();
    expect(strategyFromName("Warrior Beats")).toBeNull();
  });
});

function m(name: string, type: string, quantity: number, atk: number | null = 1800): StrategyCardInfo {
  return { name, type, atk, quantity, section: "main" };
}

describe("classifyStrategy (composition)", () => {
  it("calls a trap-heavy deck Control", () => {
    const cards: StrategyCardInfo[] = [
      m("Some Monster", "Effect Monster", 10),
      m("Trap A", "Trap Card", 8),
      m("Trap B", "Trap Card", 8),
    ];
    expect(classifyStrategy("Gravekeeper Deck", cards, "Goat")).toBe("Control");
  });

  it("calls a deck with several burn staples Burn", () => {
    const cards: StrategyCardInfo[] = [
      m("Just Desserts", "Trap Card", 3),
      m("Secret Barrel", "Trap Card", 3),
      m("Ceasefire", "Trap Card", 2),
      m("Some Monster", "Effect Monster", 32),
    ];
    expect(classifyStrategy("Random Deck", cards, "Goat")).toBe("Burn");
  });

  it("defaults a monster-heavy modern deck to Combo", () => {
    const cards: StrategyCardInfo[] = [m("Snake-Eye Ash", "Effect Monster", 30), m("Spell", "Spell Card", 10)];
    expect(classifyStrategy("Snake-Eye Fire King", cards, "Modern")).toBe("Combo");
  });

  it("calls a monster-heavy non-modern deck Aggro", () => {
    const cards: StrategyCardInfo[] = [m("Big Beater", "Normal Monster", 20, 1900), m("Spell", "Spell Card", 20)];
    expect(classifyStrategy("Warrior Beats", cards, "Goat")).toBe("Aggro");
  });

  it("honors an explicit title over composition", () => {
    const cards: StrategyCardInfo[] = [m("Monster", "Effect Monster", 40)];
    expect(classifyStrategy("Goat Control", cards, "Goat")).toBe("Control");
  });
});
