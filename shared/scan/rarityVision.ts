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

export type FoilClass = "matte" | "holo-art" | "holo-name" | "gold-name" | "rainbow";

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

export function classifyFoil(s: FoilStats): FoilClass {
  if (s.whole.specular >= SPECULAR && s.whole.hueSpread >= RAINBOW) return "rainbow";
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
  // true / false / undefined (rarity's bucket unknown, so no opinion)
  const consistent = (rar: string): boolean | undefined => {
    const rb = rarityBucket(rar);
    return rb === "unknown" ? undefined : rb === fb;
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
    // Vision can't break the tie — keep the first candidate, flag as unsure.
    return { rarity: codeCandidates[0], foil, agreement: "unknown", source: "code" };
  }

  // No set-code match: a single frame's foil class isn't specific enough to
  // name a rarity on its own, but surface that we at least saw foil.
  return { rarity: undefined, foil, agreement: "unknown", source: foil === "matte" ? "none" : "vision" };
}
