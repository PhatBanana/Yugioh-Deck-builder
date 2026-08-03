import type { MCard } from "../db";

// YGOPRODeck serves every artwork at a predictable URL keyed by its image id
// (which for a card's default art equals the card's passcode). We store the
// image ids and build URLs on demand rather than caching full URL strings.
const BASE = "https://images.ygoprodeck.com/images";

export function artSmallUrl(id: number): string {
  return `${BASE}/cards_small/${id}.jpg`;
}

export function artFullUrl(id: number): string {
  return `${BASE}/cards/${id}.jpg`;
}

// True when a card has more than one artwork to choose between.
export function hasAltArts(card: Pick<MCard, "arts">): boolean {
  return (card.arts?.length ?? 0) > 1;
}
