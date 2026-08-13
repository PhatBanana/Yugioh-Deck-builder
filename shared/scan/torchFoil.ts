import { rarityBucket, type FoilStats } from "./rarityVision";
import type { RarityCandidate } from "./rarityPrior";

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
  // ON-frame specular above this in BOTH name and art = the torch's mirror
  // reflection off the glossy card face blew out the frame; region deltas no
  // longer carry foil information. (First real device data: every reading on
  // an S24 came back 0.5–0.87 in every region — an Ultra's gold name even
  // read goldness 0.0, because blown-out pixels are white, not gold.)
  saturated: number;
  // OFF-frame (ambient) art hue spread that marks rainbow glitter. The
  // secret family's speckle shows COLOR VARIANCE in ordinary light — the one
  // signal that survives when the torch frame is glare-blown. From the same
  // device data: Quarter Century samples read 0.44/0.61, Ultras 0.0/0.09.
  ambientHue: number;
}

export const DEFAULT_TORCH_THRESHOLDS: TorchThresholds = {
  minSignal: 0.06,
  dominant: 0.05,
  goldness: 0.25,
  hueSpread: 0.35,
  uniform: 0.7,
  saturated: 0.45,
  ambientHue: 0.3,
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
  t: TorchThresholds = DEFAULT_TORCH_THRESHOLDS,
  off?: FoilStats
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

  // Glare saturation: every card face is glossy, and a point-source torch
  // blows regions out regardless of foil — at which point "which region lit
  // up" is meaningless and any tier verdict would be confidently wrong (real
  // S24 data: Ultras and Quarter Centuries all read "Super Rare" at 95% this
  // way). One blown region is enough to spoil the comparison — an Ultra in
  // that data had art at 0.65 with the name at 0.37, and "art leads" was
  // still pure glare. The reading that survives is the AMBIENT frame's hue
  // spread: rainbow glitter shows color variance without any torch. Use it
  // if we have it; otherwise admit the reading is unusable.
  if (Math.max(on.name.specular, on.art.specular) >= t.saturated) {
    const ambient = off?.art.hueSpread ?? 0;
    if (off && ambient >= t.ambientHue) {
      reasons.push(
        `torch frame glare-saturated; ambient art hue spread ${ambient.toFixed(2)} → rainbow glitter`
      );
      return { tier: "secret+", confidence: conf(ambient - t.ambientHue, 0.25), reasons };
    }
    reasons.push(
      off
        ? `torch frame glare-saturated (name ${on.name.specular.toFixed(2)}, art ${on.art.specular.toFixed(2)}), ambient shows no rainbow — reading unusable`
        : "torch frame glare-saturated and no ambient frame to fall back on"
    );
    return { tier: "unknown", confidence: 0, reasons };
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

// Below this the verdict is treated as "no opinion" and the caller falls
// through to the single-frame foil pass / prior ranking.
export const TORCH_MIN_CONFIDENCE = 0.6;

export interface NarrowResult {
  // Exactly one candidate matched the verdict — a confirmed pick.
  pick?: RarityCandidate;
  // The verdict narrowed the field (family verdicts): prior order preserved,
  // first entry is the new best guess. Equals `candidates` when the verdict
  // had no opinion.
  narrowed: RarityCandidate[];
  confident: boolean;
}

// Applies a torch verdict to a set code's (prior-ranked) candidate rarities.
// Exact tiers match by name; the secret family and embossed verdicts filter
// by bucket, since the flash can't separate e.g. Secret from Starlight.
export function narrowByVerdict(
  candidates: RarityCandidate[],
  verdict: TorchVerdict
): NarrowResult {
  const confident = verdict.confidence >= TORCH_MIN_CONFIDENCE && verdict.tier !== "unknown";
  if (!confident || candidates.length === 0) {
    return { narrowed: candidates, confident: false };
  }

  let matches: RarityCandidate[];
  if (verdict.tier === "secret+") {
    matches = candidates.filter((c) => rarityBucket(c.rarity) === "rainbow");
  } else if (verdict.tier === "embossed?") {
    matches = candidates.filter((c) => /ultimate/i.test(c.rarity));
  } else if (verdict.rarity) {
    matches = candidates.filter(
      (c) => c.rarity.toLowerCase() === verdict.rarity!.toLowerCase()
    );
  } else {
    matches = [];
  }

  if (matches.length === 1) return { pick: matches[0], narrowed: matches, confident };
  if (matches.length > 1) return { narrowed: matches, confident };
  // The verdict names a tier this code was never printed at — no opinion.
  return { narrowed: candidates, confident: false };
}
