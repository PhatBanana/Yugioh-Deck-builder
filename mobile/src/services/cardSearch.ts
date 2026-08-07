import { db } from "../db";

// In-memory name index for card search. Substring search used to re-read all
// ~13k card records from IndexedDB on every (debounced) keystroke — the
// string matching is cheap, the per-row deserialization is not. The names
// change only on a card sync or a language-pack install, so one cached pass
// serves every search until then. Localized names from installed language
// packs are part of the index, so search matches them for free.

interface NameRow {
  id: number;
  nameLower: string;
}

let cache: NameRow[] | null = null;

export function invalidateSearchIndex(): void {
  cache = null;
}

async function nameIndex(): Promise<NameRow[]> {
  if (!cache) {
    const [cards, alts] = await Promise.all([db.cards.toArray(), db.altNames.toArray()]);
    cache = cards
      .map((c) => ({ id: c.id, nameLower: c.nameLower }))
      .concat(alts.map((a) => ({ id: a.cardId, nameLower: a.nameLower })));
  }
  return cache;
}

// Ids of cards whose name (any installed language) contains `q` (lowercased).
export async function searchCardIds(q: string): Promise<Set<number>> {
  const ids = new Set<number>();
  if (!q) return ids;
  for (const row of await nameIndex()) {
    if (row.nameLower.includes(q)) ids.add(row.id);
  }
  return ids;
}
