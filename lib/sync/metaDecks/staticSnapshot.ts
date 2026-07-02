import fs from "node:fs";
import path from "node:path";
import { getCardByName } from "../../db/cardsRepo";
import { upsertStaticSnapshotDecks } from "../../db/metaDecksRepo";
import { setSyncMeta } from "../../db/syncMetaRepo";
import type { DeckSection } from "../../recommendation/types";
import { DATA_DIR } from "../../paths";

const SNAPSHOT_PATH = path.join(DATA_DIR, "static-meta-decks.json");

interface SnapshotCard {
  cardName: string;
  quantity: number;
  section: DeckSection;
  isKeyCard: boolean;
}

interface SnapshotDeck {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  cards: SnapshotCard[];
}

const KEY_CARD_WEIGHT = 1.0;
const GENERIC_CARD_WEIGHT = 0.3;

export function loadStaticSnapshotFromDisk(): SnapshotDeck[] {
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
  return JSON.parse(raw) as SnapshotDeck[];
}

// Seeds meta_decks/meta_deck_cards from the bundled static snapshot. Card
// names are resolved against the locally-synced cards table; any name that
// doesn't resolve (e.g. cards DB hasn't been synced yet) is skipped with a
// warning rather than failing the whole seed.
export function seedStaticSnapshot(): { deckCount: number; skippedCards: number } {
  const snapshotDecks = loadStaticSnapshotFromDisk();
  let skippedCards = 0;

  const decks = snapshotDecks.map((deck) => {
    const cards = deck.cards
      .map((c) => {
        const card = getCardByName(c.cardName);
        if (!card) {
          skippedCards += 1;
          console.warn(`[static-snapshot] card not found locally, skipping: "${c.cardName}"`);
          return null;
        }
        return {
          cardId: card.id,
          quantity: c.quantity,
          section: c.section,
          isKeyCard: c.isKeyCard,
          keyWeight: c.isKeyCard ? KEY_CARD_WEIGHT : GENERIC_CARD_WEIGHT,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return {
      id: deck.id,
      name: deck.name,
      archetype: deck.archetype,
      tier: deck.tier,
      cards,
    };
  });

  upsertStaticSnapshotDecks(decks);
  setSyncMeta("meta_decks_last_synced_at", new Date().toISOString());
  setSyncMeta("meta_decks_last_source", "static_snapshot");

  return { deckCount: decks.length, skippedCards };
}
