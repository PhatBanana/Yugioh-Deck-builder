import { db } from "../db";
import type { DeckCardRequirement, MetaDeck } from "../recommendation/types";

export interface MetaDeckRow {
  id: string;
  name: string;
  archetype: string | null;
  source: "scrape" | "static_snapshot";
  source_url: string | null;
  tier: string | null;
  last_updated: string;
}

export function countMetaDecks(): number {
  return (db.prepare("SELECT COUNT(*) as count FROM meta_decks").get() as { count: number })
    .count;
}

export function listMetaDeckSummaries(): MetaDeckRow[] {
  return db.prepare("SELECT * FROM meta_decks ORDER BY name ASC").all() as unknown as MetaDeckRow[];
}

interface RawDeckCardRow {
  cardId: number;
  cardName: string;
  quantity: number;
  section: DeckCardRequirement["section"];
  isKeyCard: number;
  keyWeight: number;
  priceUsd: number | null;
}

export function loadMetaDecksWithCards(): MetaDeck[] {
  const decks = db.prepare("SELECT * FROM meta_decks").all() as unknown as MetaDeckRow[];
  const cardsStmt = db.prepare(`
    SELECT mdc.card_id as cardId, c.name as cardName, mdc.quantity, mdc.section,
           mdc.is_key_card as isKeyCard, mdc.key_weight as keyWeight,
           c.price_usd as priceUsd
    FROM meta_deck_cards mdc
    JOIN cards c ON c.id = mdc.card_id
    WHERE mdc.deck_id = ?
  `);

  return decks.map((deck) => {
    const cards = cardsStmt.all(deck.id) as unknown as RawDeckCardRow[];
    return {
      id: deck.id,
      name: deck.name,
      archetype: deck.archetype,
      cards: cards.map((c) => ({ ...c, isKeyCard: !!c.isKeyCard })),
    } satisfies MetaDeck;
  });
}

export interface MetaDeckDetailCard {
  cardId: number;
  cardName: string;
  neededQuantity: number;
  ownedQuantity: number;
  section: "main" | "extra" | "side";
  isKeyCard: boolean;
  priceUsd: number | null;
}

export interface MetaDeckDetail extends MetaDeckRow {
  cards: MetaDeckDetailCard[];
}

export function getMetaDeckDetail(id: string): MetaDeckDetail | null {
  const deck = db.prepare("SELECT * FROM meta_decks WHERE id = ?").get(id) as
    | MetaDeckRow
    | undefined;
  if (!deck) return null;

  const cards = db
    .prepare(
      `SELECT mdc.card_id as cardId, c.name as cardName, mdc.quantity as neededQuantity,
              COALESCE(uc.quantity, 0) as ownedQuantity, mdc.section,
              mdc.is_key_card as isKeyCard, c.price_usd as priceUsd
       FROM meta_deck_cards mdc
       JOIN cards c ON c.id = mdc.card_id
       LEFT JOIN user_collection uc ON uc.card_id = mdc.card_id
       WHERE mdc.deck_id = ?
       ORDER BY mdc.is_key_card DESC, c.name ASC`
    )
    .all(id) as unknown as (Omit<MetaDeckDetailCard, "isKeyCard"> & { isKeyCard: number })[];

  return { ...deck, cards: cards.map((c) => ({ ...c, isKeyCard: !!c.isKeyCard })) };
}

interface DeckSeed {
  id: string;
  name: string;
  archetype: string | null;
  tier: string | null;
  sourceUrl?: string | null;
  cards: {
    cardId: number;
    quantity: number;
    section: "main" | "extra" | "side";
    isKeyCard: boolean;
    keyWeight: number;
  }[];
}

function replaceDecks(
  decks: DeckSeed[],
  source: "scrape" | "static_snapshot"
): void {
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM meta_deck_cards WHERE deck_id IN (SELECT id FROM meta_decks WHERE source = ?)"
    ).run(source);
    db.prepare("DELETE FROM meta_decks WHERE source = ?").run(source);

    const insertDeck = db.prepare(`
      INSERT INTO meta_decks (id, name, archetype, source, source_url, tier, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCard = db.prepare(`
      INSERT INTO meta_deck_cards (deck_id, card_id, quantity, section, is_key_card, key_weight)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const deck of decks) {
      insertDeck.run(deck.id, deck.name, deck.archetype, source, deck.sourceUrl ?? null, deck.tier, now);
      for (const c of deck.cards) {
        insertCard.run(deck.id, c.cardId, c.quantity, c.section, c.isKeyCard ? 1 : 0, c.keyWeight);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function replaceScrapedDecks(decks: DeckSeed[]): void {
  replaceDecks(decks, "scrape");
}

export function upsertStaticSnapshotDecks(decks: DeckSeed[]): void {
  replaceDecks(decks, "static_snapshot");
}

// Called once live scraped data is successfully stored, so the bootstrap
// fallback decks don't linger alongside fresh scraped decks indefinitely.
export function clearStaticSnapshotDecks(): void {
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM meta_deck_cards WHERE deck_id IN (SELECT id FROM meta_decks WHERE source = 'static_snapshot')"
    ).run();
    db.prepare("DELETE FROM meta_decks WHERE source = 'static_snapshot'").run();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
