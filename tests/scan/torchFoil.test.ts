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

// Regression fixtures from the first real device capture session (S24,
// RA05 Dark Magicians + Ash Blossoms in Ultra and Quarter Century Secret).
// The torch blew out every reading — specular 0.5–0.87 across regions — and
// the classifier called glossy Ultras and Quarter Centuries "Super Rare" at
// 95% confidence. These pin the two behaviours that fix demanded: blown
// frames must never yield a confident tier, and the ambient frame's hue
// spread (which survives glare) is what separates the rainbow family.
describe("classifyTorchDelta on real glare-saturated device data", () => {
  it("a Quarter Century (ambient art hue 0.61) reads secret+ despite glare", () => {
    const off = stats(region(0.0037), region(0.0175, 0.6115, 0.0571), region(0.0122, 0, 0.0408));
    const on = stats(
      region(0.8667, 0.0396, 0.3206),
      region(0.8667, 0.0503, 0.1527),
      region(0.6179, 0.0362, 0.2151)
    );
    const v = classifyTorchDelta(deltaOf(off, on), on, DEFAULT_TORCH_THRESHOLDS, off);
    expect(v.tier).toBe("secret+");
    expect(v.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("a second rainbow sample (ambient art hue 0.44) also reads secret+", () => {
    const off = stats(region(0.0889), region(0.0112, 0.4441, 0.1111), region(0.01, 0.2791, 0.075));
    const on = stats(
      region(0.6533, 0.0171, 0.3937),
      region(0.7772, 0.0851, 0.0919),
      region(0.5325, 0.0502, 0.1971)
    );
    expect(classifyTorchDelta(deltaOf(off, on), on, DEFAULT_TORCH_THRESHOLDS, off).tier).toBe(
      "secret+"
    );
  });

  it("a blown-out Ultra with no ambient rainbow abstains instead of guessing Super", () => {
    // Art 0.65 saturated while the name sat at 0.37 — "art leads" was glare,
    // not foil. The Ultra's gold name even read goldness 0 (blown pixels are
    // white). The only safe verdict is no verdict.
    const off = stats(region(0.0809), region(0.025, 0.0918, 0.13), region(0.0205, 0.0761, 0.0366));
    const on = stats(
      region(0.3652, 0, 0),
      region(0.6511, 0.0305, 0.1956),
      region(0.5109, 0.0637, 0.2931)
    );
    const v = classifyTorchDelta(deltaOf(off, on), on, DEFAULT_TORCH_THRESHOLDS, off);
    expect(v.tier).toBe("unknown");
    expect(v.confidence).toBe(0);
  });

  it("fully saturated with a flat ambient frame abstains too", () => {
    const off = stats(region(0.0624), region(0.002), region(0.0082, 0, 0.0606));
    const on = stats(
      region(0.7314, 0.0736, 0.1287),
      region(0.7503, 0.0535, 0.1035),
      region(0.5426, 0.0487, 0.1805)
    );
    expect(classifyTorchDelta(deltaOf(off, on), on, DEFAULT_TORCH_THRESHOLDS, off).tier).toBe(
      "unknown"
    );
  });

  it("without an ambient frame a saturated reading still abstains", () => {
    const on = stats(region(0.7), region(0.7), region(0.5));
    expect(classifyTorchDelta(deltaOf(OFF, on), on).tier).toBe("unknown");
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
