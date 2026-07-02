import { resolveCardId } from "../../ygoprodeck/resolve";
import type { DeckSection } from "../../recommendation/types";

const CATEGORY_URL = "https://ygoprodeck.com/category/format/tournament%20meta%20decks";
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

function extractDeckSlugs(categoryHtml: string): string[] {
  const matches = [...categoryHtml.matchAll(/href="\/deck\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

function parseSection(html: string, sectionId: string): { cardId: number; quantity: number }[] {
  const marker = `id="${sectionId}"`;
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const nextSection = html.indexOf('class="deck-output"', start + marker.length);
  const chunk = html.slice(start, nextSection === -1 ? undefined : nextSection);
  const ids = [...chunk.matchAll(/href="\/card\/\?search=(\d+)"/g)].map((m) => Number(m[1]));
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
}

async function scrapeDeckPage(slug: string): Promise<ScrapedDeck | null> {
  const url = `https://ygoprodeck.com/deck/${slug}`;
  const html = await fetchHtml(url);

  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  const sections: { section: DeckSection; sectionId: string }[] = [
    { section: "main", sectionId: "main_deck" },
    { section: "extra", sectionId: "extra_deck" },
    { section: "side", sectionId: "side_deck" },
  ];

  const cards: ScrapedCard[] = [];
  let parsedQuantity = 0;
  let resolvedQuantity = 0;
  for (const { section, sectionId } of sections) {
    const entries = parseSection(html, sectionId);
    for (const { cardId, quantity } of entries) {
      parsedQuantity += quantity;
      const resolved = await resolveCardId(cardId);
      if (!resolved) continue;
      resolvedQuantity += quantity;
      const isKeyCard =
        !!resolved.archetype &&
        (resolved.archetype.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(resolved.archetype.toLowerCase()));
      cards.push({
        cardId: resolved.id,
        quantity,
        section,
        isKeyCard,
        keyWeight: isKeyCard ? 1.0 : 0.3,
      });
    }
  }

  const resolvedRatio = parsedQuantity > 0 ? resolvedQuantity / parsedQuantity : 0;
  return { id: slug, name, archetype: name, tier: null, sourceUrl: url, cards, resolvedRatio };
}

export async function scrapeMetaDecks(): Promise<ScrapedDeck[]> {
  const categoryHtml = await fetchHtml(CATEGORY_URL);
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
