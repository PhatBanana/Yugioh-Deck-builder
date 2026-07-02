import type { ScrapedDeck } from "./scrape";

export class ScrapeValidationError extends Error {}

const MIN_DECKS = 5;
const MIN_MAIN_DECK_SIZE = 38;
const MAX_MAIN_DECK_SIZE = 62;
const MIN_RESOLVED_RATIO = 0.8;

export function validateScrapedDecks(decks: ScrapedDeck[]): void {
  if (decks.length < MIN_DECKS) {
    throw new ScrapeValidationError(
      `Only parsed ${decks.length} decks, expected at least ${MIN_DECKS}.`
    );
  }

  for (const deck of decks) {
    const mainCount = deck.cards
      .filter((c) => c.section === "main")
      .reduce((sum, c) => sum + c.quantity, 0);

    if (mainCount < MIN_MAIN_DECK_SIZE || mainCount > MAX_MAIN_DECK_SIZE) {
      throw new ScrapeValidationError(
        `Deck "${deck.name}" has an implausible main deck size (${mainCount}).`
      );
    }

    if (deck.cards.length === 0) {
      throw new ScrapeValidationError(`Deck "${deck.name}" resolved zero cards.`);
    }

    if (deck.resolvedRatio < MIN_RESOLVED_RATIO) {
      throw new ScrapeValidationError(
        `Deck "${deck.name}" only resolved ${(deck.resolvedRatio * 100).toFixed(0)}% of parsed cards to known card ids.`
      );
    }
  }
}
