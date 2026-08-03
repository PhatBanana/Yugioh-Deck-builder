import { rarityBucket } from "@shared/scan/rarityVision";

// Maps a rarity to the foil overlay that best represents its real-world finish,
// so a card's art visibly reads as its rarity even though the catalog image is
// the same for every printing. Common/unknown get no overlay.
export function foilClass(rarity: string | undefined | null): string | null {
  if (!rarity) return null;
  switch (rarityBucket(rarity)) {
    case "holo-name":
      return "foil-silver"; // Rare — silver holographic name
    case "holo-art":
      return "foil-holo"; // Super Rare — holographic artwork
    case "gold":
      return "foil-gold"; // Ultra / Gold Rare — gold foil
    case "rainbow":
      return "foil-rainbow"; // Secret / Starlight / Ghost / Collector / …
    default:
      return null; // Common / unknown
  }
}

const TIER: Record<string, number> = {
  rainbow: 5,
  gold: 4,
  "holo-art": 3,
  "holo-name": 2,
  matte: 1,
  unknown: 0,
};

// The flashiest rarity among a card's owned printings — what its thumbnail's
// foil should show.
export function topRarity(copies: { rarity?: string }[] | undefined): string | undefined {
  let best: string | undefined;
  let bestTier = -1;
  for (const c of copies ?? []) {
    if (!c.rarity) continue;
    const t = TIER[rarityBucket(c.rarity)] ?? 0;
    if (t > bestTier) {
      bestTier = t;
      best = c.rarity;
    }
  }
  return best;
}
