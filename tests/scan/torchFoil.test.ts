import { describe, expect, it } from "vitest";
import type { FoilStats } from "../../shared/scan/rarityVision";
import {
  classifyTorchDelta,
  deltaOf,
  narrowByVerdict,
  DEFAULT_TORCH_THRESHOLDS,
  type TorchVerdict,
} from "../../shared/scan/torchFoil";

const region = (specular = 0, hueSpread = 0, goldness = 0) => ({ specular, hueSpread, goldness });
const stats = (
  name = region(),
  art = region(),
  whole = region()
): FoilStats => ({ name, art, whole });

const OFF = stats(region(0.02), region(0.02), region(0.02));

describe("deltaOf", () => {
  it("subtracts per region", () => {
    const on = stats(region(0.3), region(0.12), region(0.1));
    expect(deltaOf(OFF, on)).toEqual({
      name: expect.closeTo(0.28, 5),
      art: expect.closeTo(0.1, 5),
      whole: expect.closeTo(0.08, 5),
    });
  });
});

describe("classifyTorchDelta", () => {
  it("no response anywhere → common", () => {
    const on = stats(region(0.04), region(0.04), region(0.04));
    const v = classifyTorchDelta(deltaOf(OFF, on), on);
    expect(v.tier).toBe("common");
    expect(v.rarity).toBe("Common");
  });

  it("name-led silver response → rare", () => {
    const on = stats(region(0.3), region(0.05), region(0.08));
    const v = classifyTorchDelta(deltaOf(OFF, on), on);
    expect(v.tier).toBe("rare");
  });

  it("name-led gold response → ultra", () => {
    const on = stats(region(0.3, 0, 0.5), region(0.05), region(0.08));
    const v = classifyTorchDelta(deltaOf(OFF, on), on);
    expect(v.tier).toBe("ultra");
    expect(v.confidence).toBeGreaterThan(0.5);
  });

  it("art-led response → super", () => {
    const on = stats(region(0.05), region(0.3), region(0.1));
    expect(classifyTorchDelta(deltaOf(OFF, on), on).tier).toBe("super");
  });

  it("uniform whole-card response with rainbow hues → secret family", () => {
    const on = stats(region(0.25), region(0.25), region(0.24, 0.6));
    expect(classifyTorchDelta(deltaOf(OFF, on), on).tier).toBe("secret+");
  });

  it("name+art relief without gold or rainbow → embossed candidate", () => {
    const on = stats(region(0.2), region(0.19), region(0.08));
    expect(classifyTorchDelta(deltaOf(OFF, on), on).tier).toBe("embossed?");
  });

  it("thresholds are tunable (a stricter minSignal downgrades to common)", () => {
    const on = stats(region(0.12), region(0.03), region(0.04));
    const relaxed = classifyTorchDelta(deltaOf(OFF, on), on, DEFAULT_TORCH_THRESHOLDS);
    const strict = classifyTorchDelta(deltaOf(OFF, on), on, {
      ...DEFAULT_TORCH_THRESHOLDS,
      minSignal: 0.2,
    });
    expect(relaxed.tier).toBe("rare");
    expect(strict.tier).toBe("common");
  });

  it("always explains itself", () => {
    const on = stats(region(0.3), region(0.05), region(0.08));
    expect(classifyTorchDelta(deltaOf(OFF, on), on).reasons.length).toBeGreaterThan(0);
  });
});

describe("narrowByVerdict", () => {
  const cand = (rarity: string) => ({ code: "RA05-EN083", rarity, priceUsd: null });
  const pool = [
    cand("Common"),
    cand("Ultra Rare"),
    cand("Secret Rare"),
    cand("Quarter Century Secret Rare"),
    cand("Ultimate Rare"),
  ];
  const verdict = (tier: TorchVerdict["tier"], rarity?: string, confidence = 0.8): TorchVerdict => ({
    tier,
    rarity,
    confidence,
    reasons: [],
  });

  it("an exact tier naming one printed rarity is a confirmed pick", () => {
    const r = narrowByVerdict(pool, verdict("ultra", "Ultra Rare"));
    expect(r.pick?.rarity).toBe("Ultra Rare");
    expect(r.confident).toBe(true);
  });

  it("a family verdict narrows to the bucket, keeping prior order", () => {
    const r = narrowByVerdict(pool, verdict("secret+"));
    expect(r.pick).toBeUndefined();
    expect(r.narrowed.map((c) => c.rarity)).toEqual([
      "Secret Rare",
      "Quarter Century Secret Rare",
    ]);
  });

  it("embossed narrows to Ultimate", () => {
    const r = narrowByVerdict(pool, verdict("embossed?"));
    expect(r.pick?.rarity).toBe("Ultimate Rare");
  });

  it("low confidence or unknown tier has no opinion", () => {
    expect(narrowByVerdict(pool, verdict("ultra", "Ultra Rare", 0.4)).pick).toBeUndefined();
    expect(narrowByVerdict(pool, verdict("unknown")).narrowed).toHaveLength(pool.length);
  });

  it("a tier the code was never printed at falls through untouched", () => {
    const r = narrowByVerdict([cand("Common"), cand("Rare")], verdict("secret+"));
    expect(r.pick).toBeUndefined();
    expect(r.confident).toBe(false);
    expect(r.narrowed).toHaveLength(2);
  });
});
