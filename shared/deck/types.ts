import type { DeckSection } from "../recommendation/types";

export type { DeckSection };

// A card entry in a user-built deck. Passcode == YGOPRODeck id, which is also
// what .ydk files store, so decks round-trip to other tools cleanly.
export interface DeckCard {
  cardId: number;
  quantity: number;
  section: DeckSection;
}

// Deck-building copy limits by TCG banlist status.
export function maxCopies(banlist: string | null): number {
  switch (banlist) {
    case "Banned":
      return 0;
    case "Limited":
      return 1;
    case "Semi-Limited":
      return 2;
    default:
      return 3;
  }
}
