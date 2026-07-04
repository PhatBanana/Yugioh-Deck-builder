import {
  DECK_SECTIONS,
  GENERIC_CARD_WEIGHT,
  KEY_CARD_WEIGHT,
  META_FORMATS,
  deckPageUrl,
  extractDeckName,
  extractDeckSlugs,
  isKeyCardFor,
  parseDeckSection,
} from "@shared/metaDecks/parseHtml";
import { classifyStrategy, type StrategyCardInfo } from "@shared/metaDecks/strategy";
import type { DeckSection } from "@shared/recommendation/types";
import staticSnapshot from "@data/static-meta-decks.json";
import { db, setSyncMeta, type MMetaDeck } from "../db";
import { httpGetJson, httpGetText } from "./http";

const REQUEST_DELAY_MS = 600;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface ResolvedCard {
  id: number;
  name: string;
  archetype: string | null;
  type: string;
  atk: number | null;
}

// Deck pages sometimes reference an alternate-artwork id; resolve via the
// live API by name as a fallback, mirroring the desktop scraper.
async function resolveCard(cardId: number): Promise<ResolvedCard | null> {
  const local = await db.cards.get(cardId);
  if (local) {
    return { id: local.id, name: local.name, archetype: local.archetype, type: local.type, atk: local.atk };
  }
  try {
    const json = await httpGetJson<{ data?: { name?: string }[] }>(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cardId}`
    );
    const name = json.data?.[0]?.name;
    if (!name) return null;
    const byName = await db.cards.where("nameLower").equals(name.toLowerCase()).first();
    return byName
      ? { id: byName.id, name: byName.name, archetype: byName.archetype, type: byName.type, atk: byName.atk }
      : null;
  } catch {
    return null;
  }
}

async function scrapeOneDeck(slug: string, era: string, now: string): Promise<MMetaDeck | null> {
  const html = await httpGetText(deckPageUrl(slug));
  const name = extractDeckName(html);
  if (!name) return null;

  const cards: MMetaDeck["cards"] = [];
  const composition: StrategyCardInfo[] = [];
  let parsedQty = 0;
  let resolvedQty = 0;
  for (const { section, sectionId } of DECK_SECTIONS) {
    for (const { cardId, quantity } of parseDeckSection(html, sectionId)) {
      parsedQty += quantity;
      const resolved = await resolveCard(cardId);
      if (!resolved) continue;
      resolvedQty += quantity;
      const isKeyCard = isKeyCardFor(name, resolved.archetype);
      cards.push({
        cardId: resolved.id,
        cardName: resolved.name,
        quantity,
        section,
        isKeyCard,
        keyWeight: isKeyCard ? KEY_CARD_WEIGHT : GENERIC_CARD_WEIGHT,
      });
      composition.push({ name: resolved.name, type: resolved.type, atk: resolved.atk, quantity, section });
    }
  }

  // Drop decks that mostly failed to resolve (page layout change guard).
  if (parsedQty === 0 || resolvedQty / parsedQty < 0.8) return null;
  return {
    id: slug,
    name,
    archetype: name,
    tier: null,
    era,
    strategy: classifyStrategy(name, composition, era),
    source: "scrape",
    sourceUrl: deckPageUrl(slug),
    lastUpdated: now,
    cards,
  };
}

// Scrapes each configured format category, tagging decks with the format's era
// (and a strategy derived from the deck name). A format that fails is skipped;
// the run only fails (falling back to the snapshot) if too little is gathered.
async function scrapeDecks(onProgress?: (m: string) => void): Promise<MMetaDeck[]> {
  const now = new Date().toISOString();
  const decks: MMetaDeck[] = [];

  for (const format of META_FORMATS) {
    let slugs: string[];
    try {
      const categoryHtml = await httpGetText(format.url);
      slugs = extractDeckSlugs(categoryHtml).slice(0, format.maxDecks);
    } catch {
      continue; // skip a format whose category page failed
    }

    for (const [i, slug] of slugs.entries()) {
      onProgress?.(`${format.era}: deck ${i + 1}/${slugs.length}…`);
      try {
        const deck = await scrapeOneDeck(slug, format.era, now);
        if (deck) decks.push(deck);
      } catch {
        // Skip broken deck pages.
      }
      await delay(REQUEST_DELAY_MS);
    }
  }

  if (decks.length < 3) throw new Error(`Only ${decks.length} decks scraped — not trusting it`);
  return decks;
}

interface SnapshotDeck {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  cards: { cardName: string; quantity: number; section: DeckSection; isKeyCard: boolean }[];
}

async function loadStaticSnapshot(): Promise<MMetaDeck[]> {
  const now = new Date().toISOString();
  const decks: MMetaDeck[] = [];
  for (const deck of staticSnapshot as SnapshotDeck[]) {
    const cards: MMetaDeck["cards"] = [];
    const composition: StrategyCardInfo[] = [];
    for (const c of deck.cards) {
      const card = await db.cards.where("nameLower").equals(c.cardName.toLowerCase()).first();
      if (!card) continue;
      cards.push({
        cardId: card.id,
        cardName: card.name,
        quantity: c.quantity,
        section: c.section,
        isKeyCard: c.isKeyCard,
        keyWeight: c.isKeyCard ? KEY_CARD_WEIGHT : GENERIC_CARD_WEIGHT,
      });
      composition.push({ name: card.name, type: card.type, atk: card.atk, quantity: c.quantity, section: c.section });
    }
    decks.push({
      id: deck.id,
      name: deck.name,
      archetype: deck.archetype,
      tier: deck.tier,
      // The bundled snapshot is current-format; strategy from composition.
      era: "Modern",
      strategy: classifyStrategy(deck.name, composition, "Modern"),
      source: "static_snapshot",
      sourceUrl: null,
      lastUpdated: now,
      cards,
    });
  }
  return decks;
}

export interface MetaDeckSyncResult {
  source: "scrape" | "static_snapshot";
  deckCount: number;
}

export async function syncMetaDecks(
  onProgress?: (m: string) => void
): Promise<MetaDeckSyncResult> {
  let decks: MMetaDeck[];
  let source: MetaDeckSyncResult["source"];
  try {
    decks = await scrapeDecks(onProgress);
    source = "scrape";
  } catch {
    onProgress?.("Scrape failed — using bundled deck snapshot…");
    decks = await loadStaticSnapshot();
    source = "static_snapshot";
  }

  await db.transaction("rw", db.metaDecks, async () => {
    await db.metaDecks.clear();
    await db.metaDecks.bulkPut(decks);
  });
  await setSyncMeta("meta_decks_last_synced_at", new Date().toISOString());
  await setSyncMeta("meta_decks_last_source", source);
  return { source, deckCount: decks.length };
}

// First-run guarantee: recommendations never see an empty deck table.
export async function ensureMetaDecksSeeded(): Promise<void> {
  if ((await db.metaDecks.count()) === 0 && (await db.cards.count()) > 0) {
    const decks = await loadStaticSnapshot();
    await db.metaDecks.bulkPut(decks);
    await setSyncMeta("meta_decks_last_source", "static_snapshot");
  }
}
