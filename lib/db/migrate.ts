import type { DatabaseSync } from "node:sqlite";

export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id              INTEGER PRIMARY KEY,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL,
      frame_type      TEXT,
      race            TEXT,
      attribute       TEXT,
      archetype       TEXT,
      atk             INTEGER,
      def             INTEGER,
      level           INTEGER,
      linkval         INTEGER,
      linkmarkers     TEXT,
      scale           INTEGER,
      description     TEXT,
      banlist_status  TEXT,
      image_url       TEXT,
      image_url_small TEXT,
      card_sets_json  TEXT,
      price_usd       REAL,
      raw_json        TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
    CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
    CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
    CREATE INDEX IF NOT EXISTS idx_cards_race ON cards(race);
    CREATE INDEX IF NOT EXISTS idx_cards_attribute ON cards(attribute);

    CREATE TABLE IF NOT EXISTS user_collection (
      card_id    INTEGER PRIMARY KEY REFERENCES cards(id),
      quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_decks (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      archetype    TEXT,
      source       TEXT NOT NULL CHECK (source IN ('scrape', 'static_snapshot')),
      source_url   TEXT,
      tier         TEXT,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_deck_cards (
      deck_id     TEXT NOT NULL REFERENCES meta_decks(id) ON DELETE CASCADE,
      card_id     INTEGER NOT NULL REFERENCES cards(id),
      quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 3),
      section     TEXT NOT NULL CHECK (section IN ('main', 'extra', 'side')),
      is_key_card INTEGER NOT NULL DEFAULT 0,
      key_weight  REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY (deck_id, card_id, section)
    );
    CREATE INDEX IF NOT EXISTS idx_mdc_deck ON meta_deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_mdc_card ON meta_deck_cards(card_id);

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureCardsPriceColumn(db);

  // Clean up HTML-escaped names synced before decoding was added (idempotent).
  db.exec(`
    UPDATE cards SET name = replace(replace(replace(name, '&amp;', '&'), '&lt;', '<'), '&gt;', '>')
    WHERE name LIKE '%&amp;%' OR name LIKE '%&lt;%' OR name LIKE '%&gt;%'
  `);
}

// Databases created before pricing was added need the column bolted on and
// backfilled from the raw API payload each card row already carries.
function ensureCardsPriceColumn(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(cards)").all() as unknown as { name: string }[];
  if (columns.some((c) => c.name === "price_usd")) return;

  db.exec("ALTER TABLE cards ADD COLUMN price_usd REAL");
  db.exec(`
    UPDATE cards SET price_usd = NULLIF(
      CAST(json_extract(raw_json, '$.card_prices[0].tcgplayer_price') AS REAL), 0.0
    )
  `);
}
