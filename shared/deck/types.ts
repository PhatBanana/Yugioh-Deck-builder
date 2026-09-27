import type { DeckSection } from "../recommendation/types";

export type { DeckSection };

// A card entry in a user-built deck. Passcode == YGOPRODeck id, which is also
// what .ydk files store, so decks round-trip to other tools cleanly.
export interface DeckCard {
  cardId: number;
  quantity: number;
  section: DeckSection;
}

// A 0-copy card. Two spellings reach us: the card API's TCG list says
// "Forbidden" (the official term); the data packs store "Banned".
export function isForbidden(banlist: string | null): boolean {
  return banlist === "Forbidden" || banlist === "Banned";
}

// Deck-building copy limits by banlist status.
export function maxCopies(banlist: string | null): number {
  if (isForbidden(banlist)) return 0;
  switch (banlist) {
    case "Limited":
      return 1;
    case "Semi-Limited":
      return 2;
    default:
      return 3;
  }
}
