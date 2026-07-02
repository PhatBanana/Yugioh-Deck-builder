import { resolveCardId } from "../../ygoprodeck/resolve";
import type { DeckSection } from "../../recommendation/types";
import {
  DECK_SECTIONS,
  GENERIC_CARD_WEIGHT,
  KEY_CARD_WEIGHT,
  META_DECKS_CATEGORY_URL,
  deckPageUrl,
  extractDeckName,
  extractDeckSlugs,
  isKeyCardFor,
  parseDeckSection,
} from "../../../shared/metaDecks/parseHtml";

const USER_AGENT = "ygoh-deck-recommender/1.0 (local hobby project; personal use)";
const REQUEST_DELAY_MS = 600;
const MAX_DECKS = 15;

export interface ScrapedCard {
  cardId: number;
  quantity: number;
  section: DeckSection;
  isKeyCard: boolean;
  keyWeight: number;
}

export interface ScrapedDeck {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  sourceUrl: string;
  cards: ScrapedCard[];
  resolvedRatio: number;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

async function scrapeDeckPage(slug: string): Promise<ScrapedDeck | null> {
  const url = deckPageUrl(slug);
  const html = await fetchHtml(url);

  const name = extractDeckName(html);
  if (!name) return null;

  const cards: ScrapedCard[] = [];
  let parsedQuantity = 0;
  let resolvedQuantity = 0;
  for (const { section, sectionId } of DECK_SECTIONS) {
    const entries = parseDeckSection(html, sectionId);
    for (const { cardId, quantity } of entries) {
      parsedQuantity += quantity;
      const resolved = await resolveCardId(cardId);
      if (!resolved) continue;
      resolvedQuantity += quantity;
      const isKeyCard = isKeyCardFor(name, resolved.archetype);
      cards.push({
        cardId: resolved.id,
        quantity,
        section,
        isKeyCard,
        keyWeight: isKeyCard ? KEY_CARD_WEIGHT : GENERIC_CARD_WEIGHT,
      });
    }
  }

  const resolvedRatio = parsedQuantity > 0 ? resolvedQuantity / parsedQuantity : 0;
  return { id: slug, name, archetype: name, tier: null, sourceUrl: url, cards, resolvedRatio };
}

export async function scrapeMetaDecks(): Promise<ScrapedDeck[]> {
  const categoryHtml = await fetchHtml(META_DECKS_CATEGORY_URL);
  const slugs = extractDeckSlugs(categoryHtml).slice(0, MAX_DECKS);

  const decks: ScrapedDeck[] = [];
  for (const slug of slugs) {
    try {
      const deck = await scrapeDeckPage(slug);
      if (deck) decks.push(deck);
    } catch (err) {
      console.warn(`[scrape] failed to scrape deck "${slug}":`, err);
    }
    await delay(REQUEST_DELAY_MS);
  }
  return decks;
}
