import { describe, expect, it } from "vitest";
import { isCommon, openPack, type PoolCard } from "../../shared/packs/openPack";
import {
  CLASSIC_PACK,
  MODERN_PACK,
  profileForSetDate,
  rarityTier,
  rollFoilTier,
} from "../../shared/packs/profiles";

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

const common = (id: number): PoolCard => ({ cardId: id, rarity: "Common" });
const foil = (id: number, rarity: string): PoolCard => ({ cardId: id, rarity });

describe("rarityTier", () => {
  it("ranks the standard ladder", () => {
    expect(rarityTier("Common")).toBe("common");
    expect(rarityTier("Rare")).toBe("rare");
    expect(rarityTier("Super Rare")).toBe("super");
    expect(rarityTier("Ultra Rare")).toBe("ultra");
    expect(rarityTier("Secret Rare")).toBe("secret");
  });

  it("puts chase rarities in the top tier", () => {
    expect(rarityTier("Starlight Rare")).toBe("top");
    expect(rarityTier("Ghost Rare")).toBe("top");
    expect(rarityTier("Ultimate Rare")).toBe("top");
    expect(rarityTier("Quarter Century Secret Rare")).toBe("top");
    expect(rarityTier("Collector's Rare")).toBe("top");
  });

  it("treats short prints as commons and unknown foils as mid-tier", () => {
    expect(rarityTier("Common Short Print")).toBe("common");
    expect(rarityTier("Duel Terminal Normal Parallel")).toBe("super");
  });
});

describe("profileForSetDate", () => {
  it("picks the classic profile for pre-2020 sets", () => {
    expect(profileForSetDate("2002-03-08").id).toBe("classic");
    expect(profileForSetDate("2019-12-31").id).toBe("classic");
  });

  it("picks the modern profile for 2020+ and unknown dates", () => {
    expect(profileForSetDate("2020-01-30").id).toBe("modern");
    expect(profileForSetDate(null).id).toBe("modern");
    expect(profileForSetDate(undefined).id).toBe("modern");
  });
});

describe("rollFoilTier", () => {
  it("falls back to the base tier when no upgrade hits", () => {
    expect(rollFoilTier(CLASSIC_PACK, () => 0.99)).toBe("rare");
    expect(rollFoilTier(MODERN_PACK, () => 0.99)).toBe("super");
  });

  it("upgrades to the highest tier that hits", () => {
    expect(rollFoilTier(CLASSIC_PACK, () => 0)).toBe("top");
  });

  it("roughly matches the 1-in-N ratios over many rolls", () => {
    const rand = seeded(7);
    const counts: Record<string, number> = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const tier = rollFoilTier(CLASSIC_PACK, rand);
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    // Super ~1:6 of packs (after higher tiers miss) — allow a generous band.
    expect(counts.super / n).toBeGreaterThan(0.1);
    expect(counts.super / n).toBeLessThan(0.22);
    // Rare fills the bulk of the rest.
    expect(counts.rare / n).toBeGreaterThan(0.6);
    // Secrets stay rare.
    expect((counts.secret ?? 0) / n).toBeLessThan(0.06);
  });
});

describe("openPack with a profile", () => {
  const pool: PoolCard[] = [
    ...Array.from({ length: 30 }, (_, i) => common(i + 1)),
    foil(101, "Rare"),
    foil(102, "Super Rare"),
    foil(103, "Ultra Rare"),
    foil(104, "Secret Rare"),
  ];

  it("uses the profile's pack size and keeps one foil slot", () => {
    const pack = openPack(pool, seeded(1), { profile: CLASSIC_PACK });
    expect(pack).toHaveLength(CLASSIC_PACK.size);
    expect(pack.filter((c) => !isCommon(c.rarity))).toHaveLength(1);
  });

  it("modern packs pull Super or better in the foil slot", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const pack = openPack(pool, seeded(seed), { profile: MODERN_PACK });
      const foils = pack.filter((c) => !isCommon(c.rarity));
      expect(foils).toHaveLength(1);
      expect(rarityTier(foils[0].rarity)).not.toBe("rare");
    }
  });

  it("classic packs mostly pull a plain Rare", () => {
    let rares = 0;
    const total = 200;
    for (let seed = 1; seed <= total; seed++) {
      const pack = openPack(pool, seeded(seed), { profile: CLASSIC_PACK });
      const f = pack.find((c) => !isCommon(c.rarity));
      if (f && rarityTier(f.rarity) === "rare") rares++;
    }
    expect(rares / total).toBeGreaterThan(0.55);
  });

  it("falls to a nearby tier when the rolled tier has no cards", () => {
    // Pool with no plain Rares: classic base tier must fall upward to Super.
    const noRares = [
      ...Array.from({ length: 20 }, (_, i) => common(i + 1)),
      foil(102, "Super Rare"),
    ];
    const pack = openPack(noRares, seeded(2), { profile: CLASSIC_PACK });
    const f = pack.filter((c) => !isCommon(c.rarity));
    expect(f).toHaveLength(1);
    expect(f[0].rarity).toBe("Super Rare");
  });

  it("handles an all-foil pool (side sets)", () => {
    const allFoil = Array.from({ length: 20 }, (_, i) => foil(i + 1, "Super Rare"));
    const pack = openPack(allFoil, seeded(3), { profile: MODERN_PACK });
    expect(pack).toHaveLength(MODERN_PACK.size);
  });
});
