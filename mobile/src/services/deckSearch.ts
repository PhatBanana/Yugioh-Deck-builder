import {
  GENERIC_CARD_WEIGHT,
  META_DECKS_CATEGORY_URL,
  extractDeckSlugs,
} from "@shared/metaDecks/parseHtml";
import { matchesQuery, queryTokens } from "@shared/search/textMatch";
import { db, type MMetaDeck } from "../db";
import { httpGetJson, httpGetText } from "./http";
import { scrapeOneDeck } from "./metaDecks";

// Online meta-deck search across the sources the app knows how to read.
// The APIs are unofficial, so every field access is defensive, matching is
// token-based (case- and word-order-insensitive, so "branded despia" finds
// "Despia Branded"), and each source has fallbacks: a source whose response
// we can't reach or make sense of reports an error string instead of
// throwing, and the other source's results still come through.

export type LiveSource = "YGOPRODeck" | "YugiohMeta";

export interface LiveDeckResult {
  key: string; // stable id used when caching ("ygopd-123" / "ygometa-…")
  name: string;
  format: string | null;
  source: LiveSource;
  sourceUrl: string | null;
  // Card list in one of three shapes, resolved on import:
  cardNames?: { name: string; quantity: number; section: "main" | "extra" | "side" }[];
  idSections?: { section: "main" | "extra" | "side"; ids: number[] }[];
  pageSlug?: string; // deck page to scrape (HTML fallback)
}

export interface LiveSearchOutcome {
  results: LiveDeckResult[];
  errors: string[]; // human-readable per-source failure notes
}

const PER_SOURCE_LIMIT = 12;

// Accepts a bare array or the common {data|decks|results: [...]} wrappers.
function extractRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["data", "decks", "results", "rows"]) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// ---- YGOPRODeck (ygoprodeck.com) ----------------------------------------

// getDecks.php rows carry main/extra/side decks as JSON-encoded arrays of
// card ids (a repeated id = that many copies).
function parseIdList(raw: unknown): number[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

function parseYgoprodeckRow(row: unknown): LiveDeckResult | null {
  if (typeof row !== "object" || row == null) return null;
  const r = row as Record<string, unknown>;
  const name =
    (typeof r.name === "string" && r.name) ||
    (typeof r.deck_name === "string" && r.deck_name) ||
    null;
  if (!name) return null;
  const sections = [
    { section: "main" as const, ids: parseIdList(r.main_deck) },
    { section: "extra" as const, ids: parseIdList(r.extra_deck) },
    { section: "side" as const, ids: parseIdList(r.side_deck) },
  ].filter((s) => s.ids.length > 0);
  const prettyUrl = typeof r.pretty_url === "string" ? r.pretty_url : null;
  if (sections.length === 0 && !prettyUrl) return null; // nothing we can import
  return {
    key: `ygopd-${r.id ?? prettyUrl ?? name}`,
    name,
    format: typeof r.format === "string" ? r.format : null,
    source: "YGOPRODeck",
    sourceUrl: prettyUrl ? `https://ygoprodeck.com/deck/${prettyUrl}` : null,
    ...(sections.length > 0 ? { idSections: sections } : { pageSlug: prettyUrl! }),
  };
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}

async function searchYgoprodeck(query: string): Promise<LiveDeckResult[]> {
  const tokens = queryTokens(query);
  let lastError: unknown = null;

  // 1. The deck-database JSON endpoint, name-filtered server-side.
  try {
    const data = await httpGetJson<unknown>(
      `https://ygoprodeck.com/api/decks/getDecks.php?name=${encodeURIComponent(query)}&limit=${PER_SOURCE_LIMIT}&offset=0`
    );
    const results = extractRows(data)
      .map(parseYgoprodeckRow)
      .filter((r): r is LiveDeckResult => r != null);
    if (results.length > 0) return results;
  } catch (err) {
    lastError = err;
  }

  // 2. Same endpoint unfiltered (in case the name param isn't honored),
  //    matched locally by token.
  try {
    const data = await httpGetJson<unknown>(
      `https://ygoprodeck.com/api/decks/getDecks.php?limit=100&offset=0`
    );
    const results = extractRows(data)
      .map(parseYgoprodeckRow)
      .filter((r): r is LiveDeckResult => r != null && matchesQuery(r.name, tokens))
      .slice(0, PER_SOURCE_LIMIT);
    if (results.length > 0) return results;
  } catch (err) {
    lastError = err;
  }

  // 3. HTML fallback: the tournament-meta category page (the same scrape the
  //    meta sync uses, so it's known to work), matched by slug tokens. The
  //    deck page is scraped lazily on import.
  try {
    const html = await httpGetText(META_DECKS_CATEGORY_URL);
    const slugs = extractDeckSlugs(html);
    return slugs
      .filter((slug) => matchesQuery(slug.replace(/-/g, " "), tokens))
      .slice(0, PER_SOURCE_LIMIT)
      .map((slug) => ({
        key: `ygopd-page-${slug}`,
        name: slugToName(slug),
        format: "Tournament Meta",
        source: "YGOPRODeck" as const,
        sourceUrl: `https://ygoprodeck.com/deck/${slug}`,
        pageSlug: slug,
      }));
  } catch (err) {
    lastError = lastError ?? err;
  }

  if (lastError) throw lastError;
  return [];
}

// ---- YugiohMeta (yugiohmeta.com, DLM platform) ---------------------------

// The platform's top-decks endpoint lists tournament decks with cards as
// { card: { name }, amount } entries per main/extra/side. There's no name
// query param we can rely on, so fetch a page and match locally.
function parseNamedSection(
  raw: unknown,
  section: "main" | "extra" | "side"
): { name: string; quantity: number; section: "main" | "extra" | "side" }[] {
  if (!Array.isArray(raw)) return [];
  const out: { name: string; quantity: number; section: "main" | "extra" | "side" }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry == null) continue;
    const e = entry as Record<string, unknown>;
    const card = (typeof e.card === "object" && e.card != null ? e.card : e) as Record<string, unknown>;
    const name = typeof card.name === "string" ? card.name : null;
    if (!name) continue;
    const qty = Number(e.amount ?? e.quantity ?? 1);
    out.push({ name, quantity: Number.isFinite(qty) && qty > 0 ? Math.min(3, qty) : 1, section });
  }
  return out;
}

async function searchYugiohMeta(query: string): Promise<LiveDeckResult[]> {
  const tokens = queryTokens(query);
  const data = await httpGetJson<unknown>("https://www.yugiohmeta.com/api/v1/top-decks?limit=100");
  const results: LiveDeckResult[] = [];
  for (const row of extractRows(data)) {
    if (typeof row !== "object" || row == null) continue;
    const r = row as Record<string, unknown>;
    const deckType = (typeof r.deckType === "object" && r.deckType != null ? r.deckType : {}) as Record<string, unknown>;
    const name =
      (typeof deckType.name === "string" && deckType.name) ||
      (typeof r.name === "string" && r.name) ||
      null;
    if (!name || !matchesQuery(name, tokens)) continue;
    const cardNames = [
      ...parseNamedSection(r.main, "main"),
      ...parseNamedSection(r.extra, "extra"),
      ...parseNamedSection(r.side, "side"),
    ];
    if (cardNames.length === 0) continue;
    const author = typeof r.author === "string" ? ` — ${r.author}` : "";
    results.push({
      key: `ygometa-${r._id ?? `${name}-${results.length}`}`,
      name: `${name}${author}`,
      format: typeof r.tournamentType === "string" ? r.tournamentType : "TCG",
      source: "YugiohMeta",
      sourceUrl: typeof r.url === "string" ? r.url : "https://www.yugiohmeta.com/top-decks",
      cardNames,
    });
    if (results.length >= PER_SOURCE_LIMIT) break;
  }
  return results;
}

// ---- Combined search ------------------------------------------------------

export async function searchLiveDecks(query: string): Promise<LiveSearchOutcome> {
  const outcome: LiveSearchOutcome = { results: [], errors: [] };
  const sources: { name: LiveSource; run: () => Promise<LiveDeckResult[]> }[] = [
    { name: "YGOPRODeck", run: () => searchYgoprodeck(query) },
    { name: "YugiohMeta", run: () => searchYugiohMeta(query) },
  ];
  const settled = await Promise.allSettled(sources.map((s) => s.run()));
  settled.forEach((res, i) => {
    if (res.status === "fulfilled") outcome.results.push(...res.value);
    else outcome.errors.push(`${sources[i].name}: couldn't fetch results`);
  });
  return outcome;
}

// ---- Import into the local meta-deck cache --------------------------------

// Resolves a live result's cards against the local card DB and caches it as a
// meta deck (source "live_search"), so the existing completion/ownership UI,
// wishlist and "Add to Decks" all work on it. Returns the cached deck, or
// null when too few cards resolved to be useful.
export async function importLiveDeck(result: LiveDeckResult): Promise<MMetaDeck | null> {
  // Page-scrape results carry no card list yet — fetch and parse the deck page.
  if (result.pageSlug) {
    const scraped = await scrapeOneDeck(
      result.pageSlug,
      result.format ?? "Live",
      new Date().toISOString()
    );
    if (!scraped) return null;
    const deck: MMetaDeck = { ...scraped, id: `live-${result.key}`, source: "live_search" };
    await db.metaDecks.put(deck);
    return deck;
  }

  const cards: MMetaDeck["cards"] = [];

  if (result.idSections) {
    for (const { section, ids } of result.idSections) {
      const counts = new Map<number, number>();
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      const unique = [...counts.keys()];
      const found = await db.cards.bulkGet(unique);
      unique.forEach((id, i) => {
        const card = found[i];
        if (!card) return;
        cards.push({
          cardId: card.id,
          cardName: card.name,
          quantity: Math.min(3, counts.get(id)!),
          section,
          isKeyCard: false,
          keyWeight: GENERIC_CARD_WEIGHT,
        });
      });
    }
  } else if (result.cardNames) {
    const names = [...new Set(result.cardNames.map((c) => c.name.toLowerCase()))];
    const found = await db.cards.where("nameLower").anyOf(names).toArray();
    const byName = new Map(found.map((c) => [c.nameLower, c]));
    for (const c of result.cardNames) {
      const card = byName.get(c.name.toLowerCase());
      if (!card) continue;
      cards.push({
        cardId: card.id,
        cardName: card.name,
        quantity: c.quantity,
        section: c.section,
        isKeyCard: false,
        keyWeight: GENERIC_CARD_WEIGHT,
      });
    }
  }

  if (cards.length < 5) return null; // barely anything resolved — not worth caching

  const deck: MMetaDeck = {
    id: `live-${result.key}`,
    name: result.name,
    archetype: null,
    tier: null,
    era: result.format ?? "Live",
    strategy: null,
    source: "live_search",
    sourceUrl: result.sourceUrl,
    lastUpdated: new Date().toISOString(),
    cards,
  };
  await db.metaDecks.put(deck);
  return deck;
}
