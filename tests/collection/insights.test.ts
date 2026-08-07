import { describe, expect, it } from "vitest";
import {
  groupValue,
  priceMove,
  topBy,
  topMovers,
  type MoverInput,
  type PricePoint,
} from "../../shared/collection/insights";

const pts = (...pairs: [string, number][]): PricePoint[] =>
  pairs.map(([date, priceUsd]) => ({ date, priceUsd }));

describe("priceMove", () => {
  it("compares latest to the most recent point at/before the cutoff", () => {
    const p = pts(["2026-01-01", 10], ["2026-01-15", 12], ["2026-02-01", 18]);
    const m = priceMove(p, "2026-01-16")!;
    expect(m.baseline).toBe(12);
    expect(m.latest).toBe(18);
    expect(m.absChange).toBe(6);
    expect(m.pctChange).toBeCloseTo(0.5, 10);
    expect(m.baselineDate).toBe("2026-01-15");
  });

  it("falls back to the earliest point when history is shorter than the window, flagged sinceStart", () => {
    const p = pts(["2026-02-01", 8], ["2026-02-10", 10]);
    const m = priceMove(p, "2026-01-01")!; // cutoff before any point
    expect(m.baseline).toBe(8);
    expect(m.latest).toBe(10);
    expect(m.sinceStart).toBe(true);
  });

  it("does not flag sinceStart when history reaches the cutoff", () => {
    const p = pts(["2026-01-01", 10], ["2026-02-01", 18]);
    expect(priceMove(p, "2026-01-16")!.sinceStart).toBe(false);
  });

  it("returns null for no points and 0% when baseline is 0", () => {
    expect(priceMove([], "2026-01-01")).toBeNull();
    const m = priceMove(pts(["2026-01-01", 0], ["2026-02-01", 5]), "2026-01-15")!;
    expect(m.pctChange).toBe(0);
  });
});

describe("topMovers", () => {
  const inputs: MoverInput[] = [
    { cardId: 1, points: pts(["2026-01-01", 10], ["2026-02-01", 20]) }, // +100%, +$10
    { cardId: 2, points: pts(["2026-01-01", 100], ["2026-02-01", 90]) }, // -10%, -$10
    { cardId: 3, points: pts(["2026-01-01", 0.02], ["2026-02-01", 0.06]) }, // +200% but +$0.04
    { cardId: 4, points: pts(["2026-02-01", 5]) }, // single point, no move
  ];

  it("keeps only cards past both thresholds, sorted by % magnitude", () => {
    const movers = topMovers(inputs, "2026-01-15", { minPct: 0.15, minAbs: 0.5 });
    // #2's -10% is below 15%; #3's $0.04 is below the $0.50 floor; #4 has no move.
    expect(movers.map((m) => m.cardId)).toEqual([1]);
  });

  it("ranks larger percentage moves first and respects the limit", () => {
    const big: MoverInput[] = [
      { cardId: 1, points: pts(["2026-01-01", 10], ["2026-02-01", 13]) }, // +30%
      { cardId: 2, points: pts(["2026-01-01", 10], ["2026-02-01", 18]) }, // +80%
    ];
    const movers = topMovers(big, "2026-01-15", { limit: 1 });
    expect(movers).toHaveLength(1);
    expect(movers[0].cardId).toBe(2);
  });
});

describe("groupValue", () => {
  it("totals value by key, skips missing keys, sorts descending", () => {
    const items = [
      { arch: "Blue-Eyes", v: 30 },
      { arch: "Blue-Eyes", v: 20 },
      { arch: "Dark Magician", v: 40 },
      { arch: null, v: 99 },
    ];
    const groups = groupValue(items, (i) => i.arch, (i) => i.v);
    expect(groups).toEqual([
      { key: "Blue-Eyes", value: 50, count: 2 },
      { key: "Dark Magician", value: 40, count: 1 },
    ]);
  });
});

describe("topBy", () => {
  it("returns the highest-valued items without mutating input", () => {
    const items = [{ v: 1 }, { v: 5 }, { v: 3 }];
    expect(topBy(items, (i) => i.v, 2)).toEqual([{ v: 5 }, { v: 3 }]);
    expect(items[0].v).toBe(1); // original order preserved
  });
});
