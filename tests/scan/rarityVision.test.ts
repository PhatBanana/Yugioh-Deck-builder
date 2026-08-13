import { describe, expect, it } from "vitest";
import {
  classifyFoil,
  rarityBucket,
  reconcileRarity,
  type FoilStats,
  type RegionStat,
} from "../../shared/scan/rarityVision";

const flat: RegionStat = { specular: 0.02, hueSpread: 0.05, goldness: 0 };
const stats = (over: Partial<Record<keyof FoilStats, Partial<RegionStat>>>): FoilStats => ({
  name: { ...flat, ...over.name },
  art: { ...flat, ...over.art },
  whole: { ...flat, ...over.whole },
});

describe("classifyFoil", () => {
  it("reads a matte (Common) card as matte", () => {
    expect(classifyFoil(stats({}))).toBe("matte");
  });

  it("reads holographic artwork with a matte name as holo-art (Super)", () => {
    expect(classifyFoil(stats({ art: { specular: 0.3 } }))).toBe("holo-art");
  });

  it("reads a silver holographic name as holo-name (Rare)", () => {
    expect(classifyFoil(stats({ name: { specular: 0.3 } }))).toBe("holo-name");
  });

  it("reads a gold name plate as gold-name (Ultra)", () => {
    expect(classifyFoil(stats({ name: { specular: 0.3, goldness: 0.5 } }))).toBe("gold-name");
  });

  it("reads whole-card rainbow foil as rainbow (Secret family)", () => {
    expect(classifyFoil(stats({ whole: { specular: 0.25, hueSpread: 0.6 } }))).toBe("rainbow");
  });

  it("reads rainbow glitter from ambient hue variance alone (device-validated)", () => {
    // Quarter Century ambient frames: art hue spread 0.44/0.61 at near-zero
    // specular — the glitter's color variance needs no glints to show.
    expect(classifyFoil(stats({ art: { specular: 0.017, hueSpread: 0.61 } }))).toBe("rainbow");
    expect(classifyFoil(stats({ art: { specular: 0.011, hueSpread: 0.44 } }))).toBe("rainbow");
    // An Ultra's ambient art (hue 0.09) must not.
    expect(classifyFoil(stats({ art: { specular: 0.025, hueSpread: 0.09 } }))).toBe("matte");
  });

  it("calls a glare-blown frame unclear instead of guessing", () => {
    // Torch/flash mirror off the gloss coat: regions saturate regardless of
    // foil (S24 read 0.5-0.87 everywhere). One blown region already spoils
    // the comparison.
    expect(classifyFoil(stats({ name: { specular: 0.73 }, art: { specular: 0.75 } }))).toBe(
      "unclear"
    );
    expect(classifyFoil(stats({ name: { specular: 0.37 }, art: { specular: 0.65 } }))).toBe(
      "unclear"
    );
    // …unless the hue signal still says rainbow.
    expect(
      classifyFoil(stats({ name: { specular: 0.87 }, art: { specular: 0.87, hueSpread: 0.5 } }))
    ).toBe("rainbow");
  });
});

describe("rarityBucket", () => {
  it("maps rarities to foil buckets", () => {
    expect(rarityBucket("Common")).toBe("matte");
    expect(rarityBucket("Rare")).toBe("holo-name");
    expect(rarityBucket("Super Rare")).toBe("holo-art");
    expect(rarityBucket("Ultra Rare")).toBe("gold");
    expect(rarityBucket("Secret Rare")).toBe("rainbow");
    expect(rarityBucket("Starlight Rare")).toBe("rainbow");
    expect(rarityBucket("Mosaic Rare")).toBe("unknown");
    // Ultimate is classifiable (embossed foil over the art) — previously it
    // fell through to "unknown" and vision could never weigh in on it.
    expect(rarityBucket("Ultimate Rare")).toBe("holo-art");
  });
});

describe("reconcileRarity", () => {
  it("confirms when the foil agrees with a single-code rarity", () => {
    const v = reconcileRarity(["Secret Rare"], "rainbow");
    expect(v).toMatchObject({ rarity: "Secret Rare", agreement: "confirmed", source: "code" });
  });

  it("flags a conflict when the foil disagrees", () => {
    const v = reconcileRarity(["Common"], "rainbow");
    expect(v).toMatchObject({ rarity: "Common", agreement: "conflict" });
  });

  it("keeps the code rarity but stays unknown when the bucket is unknowable", () => {
    const v = reconcileRarity(["Mosaic Rare"], "rainbow");
    expect(v).toMatchObject({ rarity: "Mosaic Rare", agreement: "unknown" });
  });

  it("disambiguates a two-rarity code using the foil", () => {
    const v = reconcileRarity(["Common", "Secret Rare"], "rainbow");
    expect(v).toMatchObject({
      rarity: "Secret Rare",
      agreement: "confirmed",
      source: "code+vision",
    });
  });

  it("stays unsure when vision matches neither candidate", () => {
    const v = reconcileRarity(["Super Rare", "Ultra Rare"], "matte");
    expect(v).toMatchObject({ rarity: "Super Rare", agreement: "unknown" });
  });

  it("prefers a vision-consistent candidate even when several share its bucket", () => {
    // Both Secret and Starlight sit in the rainbow bucket — vision can't
    // settle it, but the first consistent candidate (callers pass the list
    // prior-ranked) beats an inconsistent one like Common.
    const v = reconcileRarity(["Common", "Secret Rare", "Starlight Rare"], "rainbow");
    expect(v).toMatchObject({ rarity: "Secret Rare", agreement: "unknown" });
  });

  it("offers no rarity when there is no set-code match", () => {
    expect(reconcileRarity([], "matte")).toMatchObject({ rarity: undefined, source: "none" });
    expect(reconcileRarity([], "rainbow")).toMatchObject({ rarity: undefined, source: "vision" });
    expect(reconcileRarity([], "unclear")).toMatchObject({ rarity: undefined, source: "none" });
  });

  it("an unclear (glare-blown) foil never confirms or conflicts", () => {
    expect(reconcileRarity(["Secret Rare"], "unclear")).toMatchObject({
      rarity: "Secret Rare",
      agreement: "unknown",
    });
    // With several candidates it keeps the prior-best and stays unsure.
    expect(reconcileRarity(["Ultra Rare", "Secret Rare"], "unclear")).toMatchObject({
      rarity: "Ultra Rare",
      agreement: "unknown",
    });
  });
});
