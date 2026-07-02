import { replaceScrapedDecks } from "../../db/metaDecksRepo";
import { setSyncMeta } from "../../db/syncMetaRepo";
import type { ScrapedDeck } from "./scrape";

export function storeScrapedDecks(decks: ScrapedDeck[]): void {
  replaceScrapedDecks(
    decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      archetype: deck.archetype,
      tier: deck.tier,
      sourceUrl: deck.sourceUrl,
      cards: deck.cards,
    }))
  );
  setSyncMeta("meta_decks_last_synced_at", new Date().toISOString());
  setSyncMeta("meta_decks_last_source", "scrape");
}
