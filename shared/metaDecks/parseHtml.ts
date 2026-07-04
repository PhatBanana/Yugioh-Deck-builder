// Pure HTML-parsing helpers for YGOPRODeck's tournament meta deck pages.
// No fetching or DB access here — the desktop scraper (Node fetch) and the
// mobile app (CapacitorHttp) both feed HTML strings through these.
import type { DeckSection } from "../recommendation/types";

export const META_DECKS_CATEGORY_URL =
  "https://ygoprodeck.com/category/format/tournament%20meta%20decks";

// Format categories to scrape, each tagged with the era it represents. Verified
// live URLs. `maxDecks` keeps each format's scrape bounded. Add more formats
// here (e.g. Speed Duel) — the pipeline picks them up automatically.
export interface MetaFormat {
  era: string;
  url: string;
  maxDecks: number;
}

const FORMAT_BASE = "https://ygoprodeck.com/category/format/";

// All era/format categories YGOPRODeck exposes (non-era buckets like
// Fun/Casual, Anime, Non-Meta, Structure and redundant OCG regional variants
// are intentionally omitted). A category that returns no decks is skipped
// automatically during the scrape, so listing all of them is safe.
export const META_FORMATS: MetaFormat[] = [
  { era: "Modern", url: META_DECKS_CATEGORY_URL, maxDecks: 12 },
  { era: "Master Duel", url: `${FORMAT_BASE}master%20duel%20decks`, maxDecks: 8 },
  { era: "Edison", url: `${FORMAT_BASE}edison%20format%20decks`, maxDecks: 6 },
  { era: "Goat", url: `${FORMAT_BASE}goat%20format%20decks`, maxDecks: 6 },
  { era: "Worlds", url: `${FORMAT_BASE}worlds%20format%20decks`, maxDecks: 5 },
  { era: "Common Charity", url: `${FORMAT_BASE}common%20charity%20decks`, maxDecks: 5 },
  { era: "Speed Duel", url: `${FORMAT_BASE}speed%20duel%20decks`, maxDecks: 5 },
  { era: "Domain", url: `${FORMAT_BASE}domain%20format%20decks`, maxDecks: 5 },
  { era: "Genesys", url: `${FORMAT_BASE}genesys%20decks`, maxDecks: 5 },
  { era: "Trinity", url: `${FORMAT_BASE}trinity%20format%20decks`, maxDecks: 5 },
  { era: "Progression", url: `${FORMAT_BASE}progression%20series`, maxDecks: 5 },
  { era: "Legacy 1st Gen", url: `${FORMAT_BASE}legacy%20of%20the%20duelist%201st%20gen`, maxDecks: 5 },
];

export function deckPageUrl(slug: string): string {
  return `https://ygoprodeck.com/deck/${slug}`;
}

export function extractDeckSlugs(categoryHtml: string): string[] {
  const matches = [...categoryHtml.matchAll(/href="\/deck\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

export function extractDeckName(deckHtml: string): string | null {
  const nameMatch = deckHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
  return nameMatch?.[1]?.trim() || null;
}

export interface ParsedSectionEntry {
  cardId: number;
  quantity: number;
}

export function parseDeckSection(
  deckHtml: string,
  sectionId: string
): ParsedSectionEntry[] {
  const marker = `id="${sectionId}"`;
  const start = deckHtml.indexOf(marker);
  if (start === -1) return [];
  const nextSection = deckHtml.indexOf('class="deck-output"', start + marker.length);
  const chunk = deckHtml.slice(start, nextSection === -1 ? undefined : nextSection);
  const ids = [...chunk.matchAll(/href="\/card\/\?search=(\d+)"/g)].map((m) => Number(m[1]));
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
}

export const DECK_SECTIONS: { section: DeckSection; sectionId: string }[] = [
  { section: "main", sectionId: "main_deck" },
  { section: "extra", sectionId: "extra_deck" },
  { section: "side", sectionId: "side_deck" },
];

// A card counts as "key" for a deck when its archetype and the deck name
// reference each other (vs. generic staples usable in any deck).
export function isKeyCardFor(deckName: string, cardArchetype: string | null): boolean {
  if (!cardArchetype) return false;
  const a = cardArchetype.toLowerCase();
  const n = deckName.toLowerCase();
  return a.includes(n) || n.includes(a);
}

export const KEY_CARD_WEIGHT = 1.0;
export const GENERIC_CARD_WEIGHT = 0.3;
