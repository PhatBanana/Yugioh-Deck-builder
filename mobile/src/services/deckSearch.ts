import { GENERIC_CARD_WEIGHT } from "@shared/metaDecks/parseHtml";
import { db, type MMetaDeck } from "../db";
import { httpGetJson } from "./http";

// Online meta-deck search across the sources the app knows how to read.
// Both APIs are unofficial, so every field access is defensive: a source
// whose response we can't make sense of reports an error string instead of
// throwing, and the other source's results still come through.

export type LiveSource = "YGOPRODeck" | "YugiohMeta";

export interface LiveDeckResult {
  key: string; // stable id used when caching ("ygopd-123" / "ygometa-…")
  name: string;
  format: string | null;
  source: LiveSource;
  sourceUrl: string | null;
  // Card list in one of two shapes, resolved lazily on import:
  cardIds?: number[]; // repeated ids = copies (YGOPRODeck)
  cardNames?: { name: string; quantity: number; section: "main" | "extra" | "side" }[];
  idSections?: { section: "main" | "extra" | "side"; ids: number[] }[];
}

export interface LiveSearchOutcome {
  results: LiveDeckResult[];
  errors: string[]; // human-readable per-source failure notes
}

const PER_SOURCE_LIMIT = 12;

// ---- YGOPRODeck (ygoprodeck.com) ----------------------------------------

// getDecks.php returns an array of deck rows; main/extra/side decks arrive as
// JSON-encoded arrays of card ids (a repeated id = that many copies).
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

async function searchYgoprodeck(query: string): Promise<LiveDeckResult[]> {
  const url = `https://ygoprodeck.com/api/decks/getDecks.php?name=${encodeURIComponent(query)}&limit=${PER_SOURCE_LIMIT}`;
  const data = await httpGetJson<unknown>(url);
  const rows = Array.isArray(data) ? data : [];
  const results: LiveDeckResult[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row == null) continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : null;
    if (!name) continue;
    const sections = [
      { section: "main" as const, ids: parseIdList(r.main_deck) },
      { section: "extra" as const, ids: parseIdList(r.extra_deck) },
      { section: "side" as const, ids: parseIdList(r.side_deck) },
    ].filter((s) => s.ids.length > 0);
    if (sections.length === 0) continue;
    results.push({
      key: `ygopd-${r.id ?? name}`,
      name,
      format: typeof r.format === "string" ? r.format : null,
      source: "YGOPRODeck",
      sourceUrl: typeof r.pretty_url === "string" ? `https://ygoprodeck.com/deck/${r.pretty_url}` : null,
      idSections: sections,
    });
  }
  return results;
}

// ---- YugiohMeta (yugiohmeta.com, DLM platform) ---------------------------

// The platform's top-decks endpoint lists tournament decks with cards as
// { card: { name }, amount } entries per main/extra/side. There's no name
// query param we can rely on, so fetch a page and filter locally.
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
  const url = `https://www.yugiohmeta.com/api/v1/top-decks?limit=100`;
  const data = await httpGetJson<unknown>(url);
  const rows = Array.isArray(data) ? data : [];
  const q = query.toLowerCase();
  const results: LiveDeckResult[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row == null) continue;
    const r = row as Record<string, unknown>;
    const deckType = (typeof r.deckType === "object" && r.deckType != null ? r.deckType : {}) as Record<string, unknown>;
    const name =
      (typeof deckType.name === "string" && deckType.name) ||
      (typeof r.name === "string" && r.name) ||
      null;
    if (!name || !name.toLowerCase().includes(q)) continue;
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
