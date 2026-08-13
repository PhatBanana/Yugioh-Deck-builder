// A second-pass rarity signal taken from the scan frame itself.
//
// Rarity is a foil treatment, so the printed set code (which maps to a rarity
// in the card database) and the *look* of the card under the scanner's light
// are two independent signals. This module turns coarse per-region
// brightness/colour stats — measured from the photo by the app — into a foil
// class, then reconciles that visual class with the set code's rarity to
// confirm it, flag a conflict, or disambiguate a code that maps to more than
// one rarity.
//
// It is deliberately a heuristic, not a classifier: a single frame can't see
// the angle-shift that truly separates, say, Secret from Ultra. So the set
// code stays authoritative — vision only confirms, flags, or breaks ties. The
// learned on-device model (see mobile services/rarityModel.ts) plugs in
// alongside this when one is available.

// "unclear" = the frame was glare-blown (torch/flash on a glossy card face)
// and carries no honest foil information — distinct from "matte", which is a
// positive claim that nothing shines. Real S24 data forced the distinction:
// flashed frames read specular 0.5-0.87 in every region regardless of foil.
export type FoilClass = "matte" | "holo-art" | "holo-name" | "gold-name" | "rainbow" | "unclear";

export interface RegionStat {
  /** 0..1 fraction of very bright ("blown out") pixels — foil glints. */
  specular: number;
  /** 0..1 hue spread among bright, saturated pixels — rainbow foil. */
  hueSpread: number;
  /** 0..1 fraction of bright pixels that read as gold/yellow. */
  goldness: number;
}

export interface FoilStats {
  name: RegionStat; // the name plate across the top of the card
  art: RegionStat; // the artwork box
  whole: RegionStat;
}

// Tuning thresholds. Conservative on purpose — vision should mostly confirm or
// say "unknown", rarely override the set code.
const SPECULAR = 0.16; // a region counts as foiled above this glint fraction
const RAINBOW = 0.45; // hue spread that reads as rainbow foil
const GOLD = 0.3; // gold fraction that reads as a gold name plate
const MARGIN = 0.06; // how much brighter one region must be than another
// Rainbow glitter shows COLOR VARIANCE in ambient light, glints or not —
// device data: Quarter Century art hue spread 0.44/0.61 vs Ultra 0.0/0.09.
const AMBIENT_RAINBOW = 0.4;
// A name or art region this blown out means the frame is glare (torch/flash
// mirror off the gloss coat) and per-region comparison is meaningless.
const SATURATED = 0.45;

export function classifyFoil(s: FoilStats): FoilClass {
  // Hue-based rainbow reads survive both dim ambient frames (low specular)
  // and glare-blown flashed frames, so they come first.
  if (s.art.hueSpread >= AMBIENT_RAINBOW) return "rainbow";
  if (s.whole.specular >= SPECULAR && s.whole.hueSpread >= RAINBOW) return "rainbow";
  // Glare-blown and not rainbow: no honest read exists. "matte" here would
  // raise false conflicts against genuinely foiled cards.
  if (Math.max(s.name.specular, s.art.specular) >= SATURATED) return "unclear";
  const nameFoiled = s.name.specular >= SPECULAR;
  if (nameFoiled && s.name.goldness >= GOLD) return "gold-name";
  if (nameFoiled && s.name.specular >= s.art.specular + MARGIN) return "holo-name";
  if (s.art.specular >= SPECULAR && s.art.specular >= s.name.specular + MARGIN) return "holo-art";
  return "matte";
}

// The coarse foil "bucket" a printed rarity sits in, for cross-checking.
type Bucket = "matte" | "holo-name" | "holo-art" | "gold" | "rainbow" | "unknown";

export function rarityBucket(rarity: string): Bucket {
  const r = rarity.toLowerCase();
  if (/(secret|starlight|ghost|collector|prismatic|quarter century)/.test(r)) return "rainbow";
  // Ultimate's embossed relief foil covers the art (and more) — in a single
  // frame's specular reading it looks closest to a foiled-art card. A
  // deliberate collision with Super, same policy as the secret-family bucket
  // ("ultimate" must be checked before /ultra/ would… not match it — but be
  // explicit rather than rely on that regex accident).
  if (/ultimate/.test(r)) return "holo-art";
  if (/(ultra|gold)/.test(r)) return "gold"; // Ultra's name plate is gold foil
  if (/super/.test(r)) return "holo-art";
  if (/(common|short print|normal)/.test(r)) return "matte";
  if (r === "rare") return "holo-name"; // Rare = silver holographic name only
  return "unknown";
}

function foilBucket(f: FoilClass): Bucket {
  switch (f) {
    case "rainbow":
      return "rainbow";
    case "gold-name":
      return "gold";
    case "holo-name":
      return "holo-name";
    case "holo-art":
      return "holo-art";
    case "matte":
      return "matte";
    case "unclear":
      return "unknown"; // glare-blown frame — vision has no opinion
  }
}

export type Agreement = "confirmed" | "conflict" | "unknown";

export interface RarityVerdict {
  rarity?: string; // best rarity after reconciling the two signals
  foil: FoilClass;
  agreement: Agreement;
  source: "code" | "code+vision" | "vision" | "none";
}

// Combines the set code's candidate rarities with the visual foil class. The
// set code leads; vision confirms it, flags a conflict, or picks between
// several candidates when the code alone is ambiguous.
export function reconcileRarity(codeCandidates: string[], foil: FoilClass): RarityVerdict {
  const fb = foilBucket(foil);
  // true / false / undefined (either side's bucket unknown → no opinion)
  const consistent = (rar: string): boolean | undefined => {
    const rb = rarityBucket(rar);
    if (rb === "unknown" || fb === "unknown") return undefined;
    return rb === fb;
  };

  if (codeCandidates.length === 1) {
    const c = consistent(codeCandidates[0]);
    return {
      rarity: codeCandidates[0],
      foil,
      agreement: c === undefined ? "unknown" : c ? "confirmed" : "conflict",
      source: "code",
    };
  }

  if (codeCandidates.length > 1) {
    const hits = codeCandidates.filter((r) => consistent(r) === true);
    if (hits.length === 1) {
      return { rarity: hits[0], foil, agreement: "confirmed", source: "code+vision" };
    }
    // Vision narrowed but didn't settle it — prefer the best vision-consistent
    // candidate; with no hits at all, the best overall. Callers pass the list
    // pre-ranked by prior likelihood, so [0] is "most likely", not
    // "alphabetically first".
    return { rarity: hits[0] ?? codeCandidates[0], foil, agreement: "unknown", source: "code" };
  }

  // No set-code match: a single frame's foil class isn't specific enough to
  // name a rarity on its own, but surface that we at least saw foil (matte
  // and glare-blown frames saw nothing usable).
  return {
    rarity: undefined,
    foil,
    agreement: "unknown",
    source: foil === "matte" || foil === "unclear" ? "none" : "vision",
  };
}
