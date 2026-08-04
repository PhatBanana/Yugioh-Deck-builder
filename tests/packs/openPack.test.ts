import { describe, expect, it } from "vitest";
import { foilWeight, isCommon, openPack, type PoolCard } from "../../shared/packs/openPack";

// Deterministic RNG (mulberry32) so pack draws are reproducible.
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

describe("foilWeight", () => {
  it("ranks plain Rare highest and fancy tiers lowest", () => {
    expect(foilWeight("Rare")).toBeGreaterThan(foilWeight("Super Rare"));
    expect(foilWeight("Super Rare")).toBeGreaterThan(foilWeight("Ultra Rare"));
    expect(foilWeight("Ultra Rare")).toBeGreaterThan(foilWeight("Secret Rare"));
    expect(foilWeight("Ghost Rare")).toBeLessThan(foilWeight("Secret Rare"));
  });
});

describe("isCommon", () => {
  it("only treats Common as common", () => {
    expect(isCommon("Common")).toBe(true);
    expect(isCommon("common")).toBe(true);
    expect(isCommon("Rare")).toBe(false);
  });
});

describe("openPack", () => {
  const pool: PoolCard[] = [
    ...Array.from({ length: 30 }, (_, i) => common(i + 1)),
    foil(101, "Rare"),
    foil(102, "Super Rare"),
    foil(103, "Ultra Rare"),
  ];

  it("draws a 9-card pack with exactly one foil", () => {
    const pack = openPack(pool, seeded(1));
    expect(pack).toHaveLength(9);
    const foils = pack.filter((c) => !isCommon(c.rarity));
    expect(foils).toHaveLength(1);
  });

  it("never repeats a card when the pool is big enough (no replacement)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pack = openPack(pool, seeded(seed));
      const ids = pack.map((c) => c.cardId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("tolerates pools smaller than the pack size", () => {
    const tiny = [common(1), common(2), foil(101, "Rare")];
    const pack = openPack(tiny, seeded(3));
    expect(pack).toHaveLength(9); // repeats allowed only once the pool runs dry
  });

  it("is all commons when the pool has no foils", () => {
    const pack = openPack(pool.filter((c) => isCommon(c.rarity)), seeded(2));
    expect(pack.every((c) => isCommon(c.rarity))).toBe(true);
  });

  it("returns an empty pack for an empty pool", () => {
    expect(openPack([], seeded(3))).toEqual([]);
  });

  it("respects a custom size and foil-slot count", () => {
    const pack = openPack(pool, seeded(4), { size: 5, foilSlots: 2 });
    expect(pack).toHaveLength(5);
    expect(pack.filter((c) => !isCommon(c.rarity)).length).toBeGreaterThanOrEqual(2);
  });
});
