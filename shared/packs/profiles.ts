// Era-based booster pack odds. Yu-Gi-Oh! print ratios changed over the TCG's
// life: early boosters had a plain-Rare slot that occasionally upgraded, while
// modern core boosters (2020 on) guarantee a Super-or-better foil in every
// pack. The numbers here are researched community approximations of pull
// ratios, not official print-run figures — close enough for a simulator.

export type RarityTier = "common" | "rare" | "super" | "ultra" | "secret" | "top";

// Ranks a printed rarity string into the tier ladder the odds tables use.
// "top" is the chase tier (Starlight/Ghost/Ultimate/Collector's/Quarter
// Century) that replaces another foil at very long odds.
export function rarityTier(rarity: string): RarityTier {
  const r = rarity.toLowerCase();
  if (r === "common" || r.includes("short print")) return "common";
  if (/(starlight|ghost|ultimate|collector|quarter)/.test(r)) return "top";
  if (r.includes("secret")) return "secret";
  if (r.includes("ultra")) return "ultra";
  if (r.includes("super")) return "super";
  if (r.includes("rare")) return "rare";
  return "super"; // unknown foil naming — treat as a mid-tier foil
}

// Tier order from lowest to highest, for fallback when a set has no cards of
// the rolled tier.
export const TIER_ORDER: RarityTier[] = ["common", "rare", "super", "ultra", "secret", "top"];

export interface PackProfile {
  id: "classic" | "modern";
  label: string;
  size: number; // cards per pack
  // The foil slot's tier when no upgrade roll hits.
  baseTier: RarityTier;
  // Checked highest tier first: a 1-in-N packs chance the foil slot is this
  // tier instead of baseTier.
  upgrades: { tier: RarityTier; oneIn: number }[];
}

// 2002–2019 boosters: 9 cards, 8 commons + 1 Rare, with the Rare replaced by
// a Super ~1:6 packs, Ultra ~1:12, Secret ~1:31, Ultimate/Ghost ~1:288.
export const CLASSIC_PACK: PackProfile = {
  id: "classic",
  label: "Classic booster",
  size: 9,
  baseTier: "rare",
  upgrades: [
    { tier: "top", oneIn: 288 },
    { tier: "secret", oneIn: 31 },
    { tier: "ultra", oneIn: 12 },
    { tier: "super", oneIn: 6 },
  ],
};

// 2020+ core boosters: 9 cards with a guaranteed foil — Super baseline,
// Ultra ~1:6, Secret ~1:12, Starlight ~1:385.
export const MODERN_PACK: PackProfile = {
  id: "modern",
  label: "Modern booster",
  size: 9,
  baseTier: "super",
  upgrades: [
    { tier: "top", oneIn: 385 },
    { tier: "secret", oneIn: 12 },
    { tier: "ultra", oneIn: 6 },
  ],
};

// Picks the era profile from a set's TCG release date (YYYY-MM-DD). Sets with
// no known date get the modern profile — the simulator is mostly pointed at
// recent product.
export function profileForSetDate(date: string | null | undefined): PackProfile {
  if (date && date < "2020-01-01") return CLASSIC_PACK;
  return MODERN_PACK;
}

// Rolls the foil slot's tier: upgrade chances top-down, else the base tier.
export function rollFoilTier(profile: PackProfile, rand: () => number): RarityTier {
  for (const u of profile.upgrades) {
    if (rand() < 1 / u.oneIn) return u.tier;
  }
  return profile.baseTier;
}
