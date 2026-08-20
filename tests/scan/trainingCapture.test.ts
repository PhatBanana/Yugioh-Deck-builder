import { describe, expect, it } from "vitest";
import {
  CAPTURE_CAP_BYTES,
  foilFamilyFor,
  planEviction,
} from "../../shared/scan/trainingCapture";

describe("foilFamilyFor", () => {
  it("maps each visually distinct tier to its family", () => {
    expect(foilFamilyFor("Common")).toBe("matte");
    expect(foilFamilyFor("Rare")).toBe("holo-name");
    expect(foilFamilyFor("Super Rare")).toBe("holo-art");
    expect(foilFamilyFor("Ultra Rare")).toBe("gold-name");
    expect(foilFamilyFor("Secret Rare")).toBe("rainbow");
    expect(foilFamilyFor("Quarter Century Secret Rare")).toBe("rainbow");
    expect(foilFamilyFor("Ghost Rare")).toBe("rainbow");
  });

  it("renames the bucket vocabulary's 'gold' to the class vocabulary's 'gold-name'", () => {
    expect(foilFamilyFor("Gold Rare")).toBe("gold-name");
  });

  it("refuses rarities whose finish is unknown or varies — no trusted family, no label", () => {
    expect(foilFamilyFor("Starfoil Rare")).toBeNull();
    expect(foilFamilyFor("Duel Terminal Normal Parallel Rare")).toBeNull();
  });
});

describe("planEviction", () => {
  const ex = (id: number, at: string, bytes: number) => ({ id, at, bytes });

  it("evicts nothing while the incoming example still fits", () => {
    const stored = [ex(1, "2026-01-01", 400), ex(2, "2026-01-02", 400)];
    expect(planEviction(stored, 100, 1000)).toEqual([]);
  });

  it("evicts oldest-first until the incoming example fits", () => {
    const stored = [
      ex(3, "2026-01-03", 300),
      ex(1, "2026-01-01", 300),
      ex(2, "2026-01-02", 300),
    ];
    // 900 stored + 600 incoming = 1500 over a 1000 cap → drop the two oldest.
    expect(planEviction(stored, 600, 1000)).toEqual([1, 2]);
  });

  it("orders by timestamp, not by id or input order", () => {
    const stored = [ex(9, "2026-01-05", 500), ex(1, "2026-01-06", 500)];
    expect(planEviction(stored, 500, 1000)).toEqual([9]);
  });

  it("empties the store when the incoming example alone exceeds the cap", () => {
    const stored = [ex(1, "2026-01-01", 100)];
    expect(planEviction(stored, 2000, 1000)).toEqual([1]);
  });

  it("defaults to the 1 GiB cap", () => {
    const stored = [ex(1, "2026-01-01", CAPTURE_CAP_BYTES - 50)];
    expect(planEviction(stored, 100)).toEqual([1]);
  });
});
