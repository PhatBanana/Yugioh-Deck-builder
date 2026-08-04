import { maxCopies, type DeckSection } from "./types";

// A deck card enriched with the info needed to validate it.
export interface ValidatableCard {
  cardId: number;
  name: string;
  quantity: number;
  section: DeckSection;
  banlist: string | null;
}

export interface DeckValidation {
  mainCount: number;
  extraCount: number;
  sideCount: number;
  errors: string[]; // makes the deck illegal
  warnings: string[]; // legal but worth noting
  legal: boolean;
}

// Deck size rules differ per format: standard play is 40–60/15/15, Speed
// Duel runs a 20–30 main with 0–6 extra/side.
export interface DeckSizeProfile {
  mainMin: number;
  mainMax: number;
  extraMax: number;
  sideMax: number;
}

export const STANDARD_SIZES: DeckSizeProfile = { mainMin: 40, mainMax: 60, extraMax: 15, sideMax: 15 };
export const SPEED_SIZES: DeckSizeProfile = { mainMin: 20, mainMax: 30, extraMax: 6, sideMax: 6 };

export function validateDeck(
  cards: ValidatableCard[],
  sizes: DeckSizeProfile = STANDARD_SIZES
): DeckValidation {
  const count = (s: DeckSection) =>
    cards.filter((c) => c.section === s).reduce((n, c) => n + c.quantity, 0);
  const mainCount = count("main");
  const extraCount = count("extra");
  const sideCount = count("side");

  const errors: string[] = [];
  const warnings: string[] = [];

  if (mainCount < sizes.mainMin) errors.push(`Main Deck has ${mainCount} cards (needs at least ${sizes.mainMin}).`);
  if (mainCount > sizes.mainMax) errors.push(`Main Deck has ${mainCount} cards (max ${sizes.mainMax}).`);
  if (extraCount > sizes.extraMax) errors.push(`Extra Deck has ${extraCount} cards (max ${sizes.extraMax}).`);
  if (sideCount > sizes.sideMax) errors.push(`Side Deck has ${sideCount} cards (max ${sizes.sideMax}).`);

  // Copy limits apply across all sections combined, per unique card.
  const totalById = new Map<number, { name: string; total: number; banlist: string | null }>();
  for (const c of cards) {
    const entry = totalById.get(c.cardId);
    if (entry) entry.total += c.quantity;
    else totalById.set(c.cardId, { name: c.name, total: c.quantity, banlist: c.banlist });
  }
  for (const { name, total, banlist } of totalById.values()) {
    const max = maxCopies(banlist);
    if (total > max) {
      if (max === 0) errors.push(`${name} is Forbidden (0 allowed), deck has ${total}.`);
      else errors.push(`${name}: ${total} copies exceeds the limit of ${max}.`);
    }
  }

  return { mainCount, extraCount, sideCount, errors, warnings, legal: errors.length === 0 };
}
