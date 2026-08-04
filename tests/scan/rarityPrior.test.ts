import { describe, expect, it } from "vitest";
import { pickByPrior, pullShare, rankByPrior } from "../../shared/scan/rarityPrior";

const c = (rarity: string, priceUsd: number | null = null, code = "RA01-EN001") => ({
  code,
  rarity,
  priceUsd,
});

describe("rankByPrior", () => {
  it("ranks Common above every foil tier (it fills most pack slots)", () => {
    const ranked = rankByPrior([c("Secret Rare"), c("Ultra Rare"), c("Common"), c("Rare")]);
    expect(ranked.map((x) => x.rarity)).toEqual([
      "Common",
      "Rare",
      "Ultra Rare",
      "Secret Rare",
    ]);
  });

  it("orders foil tiers by pull rate: Rare > Super > Ultra > Secret > Starlight", () => {
    const ranked = rankByPrior([
      c("Starlight Rare"),
      c("Secret Rare"),
      c("Super Rare"),
      c("Ultra Rare"),
      c("Rare"),
    ]);
    expect(ranked.map((x) => x.rarity)).toEqual([
      "Rare",
      "Super Rare",
      "Ultra Rare",
      "Secret Rare",
      "Starlight Rare",
    ]);
  });

  it("breaks weight ties toward the cheaper printing, unknown price last", () => {
    // Ghost and Starlight share the lowest foil weight tier.
    const ranked = rankByPrior([
      c("Starlight Rare", null),
      c("Ghost Rare", 80),
      c("Ultimate Rare", 30),
    ]);
    expect(ranked.map((x) => x.rarity)).toEqual([
      "Ultimate Rare",
      "Ghost Rare",
      "Starlight Rare",
    ]);
  });

  it("is stable and does not mutate its input", () => {
    const input = [c("Secret Rare", 5, "A"), c("Secret Rare", 5, "B")];
    const ranked = rankByPrior(input);
    expect(ranked.map((x) => x.code)).toEqual(["A", "B"]);
    expect(input[0].code).toBe("A");
  });
});

describe("pickByPrior", () => {
  it("returns the single most-likely candidate", () => {
    expect(pickByPrior([c("Secret Rare"), c("Common")])?.rarity).toBe("Common");
    expect(pickByPrior([])).toBeUndefined();
  });
});

describe("pullShare", () => {
  it("gives Common the dominant share of a mixed pool", () => {
    const all = [c("Common"), c("Rare"), c("Secret Rare")];
    expect(pullShare("Common", all)).toBeGreaterThan(0.7);
    expect(pullShare("Secret Rare", all)).toBeLessThan(0.05);
  });

  it("shares sum to 1 and empty pools give 0", () => {
    const all = [c("Common"), c("Ultra Rare")];
    const sum = pullShare("Common", all) + pullShare("Ultra Rare", all);
    expect(sum).toBeCloseTo(1, 10);
    expect(pullShare("Rare", [])).toBe(0);
  });
});
