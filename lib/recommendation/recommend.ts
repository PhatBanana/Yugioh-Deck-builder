import { scoreDeck } from "./scoreDeck";
import type { DeckRecommendation, MetaDeck, OwnedCollection, RecommendOptions } from "./types";

// Scraped meta decks often include several variants of the same archetype
// (e.g. three different "Sky Striker" lists). Group by normalized name so the
// top-N shows distinct decks, keeping only the best-scoring variant of each.
function dedupeKey(rec: DeckRecommendation): string {
  return (rec.archetype ?? rec.deckName).trim().toLowerCase();
}

export function recommendTopDecks(
  decks: MetaDeck[],
  owned: OwnedCollection,
  options: RecommendOptions = {}
): DeckRecommendation[] {
  const limit = options.limit ?? 5;
  const scored = decks
    .map((deck) => scoreDeck(deck, owned, { includeSide: options.includeSide }))
    .sort((a, b) => {
      if (b.completionScore !== a.completionScore) return b.completionScore - a.completionScore;
      if (b.rawCompletionPct !== a.rawCompletionPct) return b.rawCompletionPct - a.rawCompletionPct;
      return a.deckName.localeCompare(b.deckName);
    });

  const seen = new Set<string>();
  const results: DeckRecommendation[] = [];
  for (const rec of scored) {
    const key = dedupeKey(rec);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(rec);
    if (results.length >= limit) break;
  }
  return results;
}
