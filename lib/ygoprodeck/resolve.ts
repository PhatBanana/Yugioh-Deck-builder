import { getCardById, getCardByName } from "../db/cardsRepo";

const USER_AGENT = "ygoh-deck-recommender/1.0 (local hobby project; personal use)";

export interface ResolvedCard {
  id: number;
  name: string;
  archetype: string | null;
}

// Resolves a card id against the local catalog. Deck pages and .ydk files
// sometimes reference an alternate-artwork image id rather than the primary
// card id; for those, fall back to the live API and re-resolve by name.
export async function resolveCardId(id: number): Promise<ResolvedCard | null> {
  const local = getCardById(id);
  if (local) return { id: local.id, name: local.name, archetype: local.archetype };

  try {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { name: string }[] };
    const name = json.data?.[0]?.name;
    if (!name) return null;
    const byName = getCardByName(name);
    return byName ? { id: byName.id, name: byName.name, archetype: byName.archetype } : null;
  } catch {
    return null;
  }
}
