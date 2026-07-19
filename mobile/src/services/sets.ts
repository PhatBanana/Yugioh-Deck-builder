import { matchesQuery, queryTokens } from "@shared/search/textMatch";
import { db, type MSet, type MSetCards } from "../db";
import { httpGetJson } from "./http";

// Set completion: the catalogue of all card sets (cached once from
// cardsets.php) plus per-set contents resolved to local card ids on demand
// (cardinfo.php?cardset=), joined against the collection.

const SET_LIST_REFRESH_DAYS = 14;

interface ApiSet {
  set_name?: string;
  set_code?: string;
  num_of_cards?: number;
  tcg_date?: string;
}

// Fetches and caches the set catalogue. Returns the cached list on any
// failure so the browser works offline once primed.
export async function ensureSetList(): Promise<number> {
  const lastFetched = (await db.syncMeta.get("sets_fetched_at"))?.value;
  const count = await db.sets.count();
  const fresh =
    lastFetched &&
    Date.now() - new Date(lastFetched).getTime() < SET_LIST_REFRESH_DAYS * 86_400_000;
  if (count > 0 && fresh) return count;

  try {
    const data = await httpGetJson<ApiSet[]>("https://db.ygoprodeck.com/api/v7/cardsets.php");
    const rows: MSet[] = (Array.isArray(data) ? data : [])
      .filter((s) => s.set_name)
      .map((s) => ({
        name: s.set_name!,
        nameLower: s.set_name!.toLowerCase(),
        code: s.set_code ?? null,
        cardCount: s.num_of_cards ?? 0,
        date: s.tcg_date ?? null,
      }));
    if (rows.length > 0) {
      await db.transaction("rw", db.sets, async () => {
        await db.sets.clear();
        await db.sets.bulkPut(rows);
      });
      await db.syncMeta.put({ key: "sets_fetched_at", value: new Date().toISOString() });
      return rows.length;
    }
  } catch {
    // offline / API hiccup — fall through to whatever is cached
  }
  return count;
}

export async function searchSets(query: string, limit = 30): Promise<MSet[]> {
  const tokens = queryTokens(query);
  const all = await db.sets.toArray();
  return all
    .filter((s) => matchesQuery(`${s.name} ${s.code ?? ""}`, tokens))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

export interface SetCompletion {
  set: MSet;
  ownedCards: { cardId: number; name: string; img: string | null; owned: number }[];
  missingCards: { cardId: number; name: string; img: string | null; price: number | null }[];
  unresolvedCount: number;
}

async function getSetCardIds(setName: string): Promise<MSetCards | null> {
  const cached = await db.setCards.get(setName);
  if (cached) return cached;
  try {
    const data = await httpGetJson<{ data?: { id?: number; name?: string }[] }>(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`
    );
    const apiCards = data.data ?? [];
    // Resolve every card by id first, then fall back to name (alt-artwork ids)
    // — done in two batch queries rather than a lookup per card.
    const ids = apiCards.map((c) => c.id).filter((id): id is number => id != null);
    const byId = new Set((await db.cards.bulkGet(ids)).filter(Boolean).map((c) => c!.id));
    const names = [...new Set(apiCards.map((c) => c.name?.toLowerCase()).filter(Boolean))];
    const byNameLower = new Map(
      (await db.cards.where("nameLower").anyOf(names as string[]).toArray()).map((c) => [
        c.nameLower,
        c.id,
      ])
    );
    const cardIds: number[] = [];
    let unresolvedCount = 0;
    for (const c of apiCards) {
      const named = c.name ? byNameLower.get(c.name.toLowerCase()) : undefined;
      if (c.id != null && byId.has(c.id)) cardIds.push(c.id);
      else if (named != null) cardIds.push(named);
      else unresolvedCount++;
    }
    const record: MSetCards = {
      setName,
      fetchedAt: new Date().toISOString(),
      cardIds: [...new Set(cardIds)],
      unresolvedCount,
    };
    await db.setCards.put(record);
    return record;
  } catch {
    return null;
  }
}

// Owned vs missing for one set. Returns null when the set contents can't be
// fetched (offline and not cached).
export async function getSetCompletion(setName: string): Promise<SetCompletion | null> {
  const set = await db.sets.get(setName);
  const contents = await getSetCardIds(setName);
  if (!set || !contents) return null;

  const [cards, coll] = await Promise.all([
    db.cards.bulkGet(contents.cardIds),
    db.collection.bulkGet(contents.cardIds),
  ]);
  const ownedCards: SetCompletion["ownedCards"] = [];
  const missingCards: SetCompletion["missingCards"] = [];
  contents.cardIds.forEach((cardId, i) => {
    const card = cards[i];
    const owned = coll[i]?.quantity ?? 0;
    const base = { cardId, name: card?.name ?? `#${cardId}`, img: card?.img ?? null };
    if (owned > 0) ownedCards.push({ ...base, owned });
    else missingCards.push({ ...base, price: card?.price ?? null });
  });
  ownedCards.sort((a, b) => a.name.localeCompare(b.name));
  missingCards.sort((a, b) => a.name.localeCompare(b.name));
  return { set, ownedCards, missingCards, unresolvedCount: contents.unresolvedCount };
}
