import type { FoilStats } from "./rarityVision";

// Torch-differential foil classification (experimental).
//
// Foil is a *reflectivity* property, and a single ambient frame can't separate
// e.g. Secret from Ultra. But the same card under torch-off and torch-on —
// with exposure locked between the two captures — reveals WHERE the extra
// light bounces back: only the name plate (Rare), only the art (Super), a
// gold name plate (Ultra), across the whole card with rainbow hue spread
// (the Secret family), or name+art relief without gold (Ultimate-style
// embossing — tentative until device data confirms it).
//
// Pure math over two FoilStats readings; thresholds are exported so the lab
// UI can tune them live against recorded samples.

export interface RegionDelta {
  name: number; // specular(on) - specular(off), per region
  art: number;
  whole: number;
}

export interface TorchThresholds {
  minSignal: number; // any delta below this is noise → matte/common
  dominant: number; // a region "leads" when it exceeds others by this margin
  goldness: number; // ON-frame name goldness that marks a gold plate (Ultra)
  hueSpread: number; // ON-frame whole-card hue spread that marks rainbow
  uniform: number; // whole-card delta this close to the max region = uniform
}

export const DEFAULT_TORCH_THRESHOLDS: TorchThresholds = {
  minSignal: 0.06,
  dominant: 0.05,
  goldness: 0.25,
  hueSpread: 0.35,
  uniform: 0.7,
};

export type TorchTier =
  | "common"
  | "rare"
  | "super"
  | "ultra"
  | "secret+"
  | "embossed?"
  | "unknown";

export interface TorchVerdict {
  tier: TorchTier;
  rarity?: string; // canonical rarity name when the tier maps to one
  confidence: number; // 0..1, from how decisively the rules fired
  reasons: string[]; // human-readable, for the lab display
}

const TIER_RARITY: Partial<Record<TorchTier, string>> = {
  common: "Common",
  rare: "Rare",
  super: "Super Rare",
  ultra: "Ultra Rare",
};

export function deltaOf(off: FoilStats, on: FoilStats): RegionDelta {
  return {
    name: on.name.specular - off.name.specular,
    art: on.art.specular - off.art.specular,
    whole: on.whole.specular - off.whole.specular,
  };
}

export function classifyTorchDelta(
  delta: RegionDelta,
  on: FoilStats,
  t: TorchThresholds = DEFAULT_TORCH_THRESHOLDS
): TorchVerdict {
  const reasons: string[] = [];
  const name = Math.max(0, delta.name);
  const art = Math.max(0, delta.art);
  const whole = Math.max(0, delta.whole);
  const top = Math.max(name, art);

  // Nothing lit up: no foil anywhere → common (or a matte short print).
  if (top < t.minSignal && whole < t.minSignal) {
    reasons.push(`no region brightened ≥ ${t.minSignal}`);
    return { tier: "common", rarity: TIER_RARITY.common, confidence: conf(t.minSignal - top, t.minSignal), reasons };
  }

  // Whole-card response ≈ the strongest region → the foil covers the card.
  const uniform = whole >= t.minSignal && whole >= top * t.uniform;
  if (uniform && on.whole.hueSpread >= t.hueSpread) {
    reasons.push(`uniform Δ${whole.toFixed(2)} with hue spread ${on.whole.hueSpread.toFixed(2)}`);
    return { tier: "secret+", confidence: conf(on.whole.hueSpread - t.hueSpread, 0.3), reasons };
  }

  // Name-plate-led response.
  if (name >= t.minSignal && name >= art + t.dominant) {
    if (on.name.goldness >= t.goldness) {
      reasons.push(`name Δ${name.toFixed(2)} leads, gold plate (${on.name.goldness.toFixed(2)})`);
      return { tier: "ultra", rarity: TIER_RARITY.ultra, confidence: conf(on.name.goldness - t.goldness, 0.3), reasons };
    }
    reasons.push(`name Δ${name.toFixed(2)} leads, silver plate`);
    return { tier: "rare", rarity: TIER_RARITY.rare, confidence: conf(name - art - t.dominant, 0.15), reasons };
  }

  // Art-led response.
  if (art >= t.minSignal && art >= name + t.dominant) {
    reasons.push(`art Δ${art.toFixed(2)} leads`);
    return { tier: "super", rarity: TIER_RARITY.super, confidence: conf(art - name - t.dominant, 0.15), reasons };
  }

  // Name AND art respond together without gold or rainbow — the embossed
  // relief signature we *expect* from Ultimate, pending device confirmation.
  if (name >= t.minSignal && art >= t.minSignal) {
    reasons.push(`name Δ${name.toFixed(2)} + art Δ${art.toFixed(2)} together, no gold/rainbow`);
    return { tier: "embossed?", confidence: 0.3, reasons };
  }

  reasons.push("mixed response matched no rule");
  return { tier: "unknown", confidence: 0, reasons };
}

// Maps rule slack to a 0.5–0.95 confidence: barely past the threshold → 0.5,
// `span` past it → 0.95.
function conf(slack: number, span: number): number {
  const x = Math.max(0, Math.min(1, span > 0 ? slack / span : 0));
  return 0.5 + 0.45 * x;
}
