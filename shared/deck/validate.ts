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

const MAIN_MIN = 40;
const MAIN_MAX = 60;
const EXTRA_MAX = 15;
const SIDE_MAX = 15;

export function validateDeck(cards: ValidatableCard[]): DeckValidation {
  const count = (s: DeckSection) =>
    cards.filter((c) => c.section === s).reduce((n, c) => n + c.quantity, 0);
  const mainCount = count("main");
  const extraCount = count("extra");
  const sideCount = count("side");

  const errors: string[] = [];
  const warnings: string[] = [];

  if (mainCount < MAIN_MIN) errors.push(`Main Deck has ${mainCount} cards (needs at least ${MAIN_MIN}).`);
  if (mainCount > MAIN_MAX) errors.push(`Main Deck has ${mainCount} cards (max ${MAIN_MAX}).`);
  if (extraCount > EXTRA_MAX) errors.push(`Extra Deck has ${extraCount} cards (max ${EXTRA_MAX}).`);
  if (sideCount > SIDE_MAX) errors.push(`Side Deck has ${sideCount} cards (max ${SIDE_MAX}).`);

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
