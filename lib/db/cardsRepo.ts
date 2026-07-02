import { db } from "../db";
import type { YgoCard } from "../ygoprodeck/types";

export interface Card {
  id: number;
  name: string;
  type: string;
  frame_type: string | null;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  atk: number | null;
  def: number | null;
  level: number | null;
  linkval: number | null;
  linkmarkers: string | null;
  scale: number | null;
  description: string | null;
  banlist_status: string | null;
  image_url: string | null;
  image_url_small: string | null;
  card_sets_json: string | null;
  price_usd: number | null;
  raw_json: string;
  updated_at: string;
}

// A couple of card names arrive from the API HTML-escaped
// (e.g. "Graceful &amp; Skull Dice") — decode so name display and lookups work.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

// Lowest listed TCGPlayer price, or null when the API reports no/zero price.
function extractPriceUsd(card: YgoCard): number | null {
  const raw = card.card_prices?.[0]?.tcgplayer_price;
  const price = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(price) && price > 0 ? price : null;
}

const upsertStmt = () =>
  db.prepare(`
    INSERT INTO cards (
      id, name, type, frame_type, race, attribute, archetype,
      atk, def, level, linkval, linkmarkers, scale, description,
      banlist_status, image_url, image_url_small, card_sets_json, price_usd, raw_json, updated_at
    ) VALUES (
      @id, @name, @type, @frame_type, @race, @attribute, @archetype,
      @atk, @def, @level, @linkval, @linkmarkers, @scale, @description,
      @banlist_status, @image_url, @image_url_small, @card_sets_json, @price_usd, @raw_json, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, type = excluded.type, frame_type = excluded.frame_type,
      race = excluded.race, attribute = excluded.attribute, archetype = excluded.archetype,
      atk = excluded.atk, def = excluded.def, level = excluded.level,
      linkval = excluded.linkval, linkmarkers = excluded.linkmarkers, scale = excluded.scale,
      description = excluded.description, banlist_status = excluded.banlist_status,
      image_url = excluded.image_url, image_url_small = excluded.image_url_small,
      card_sets_json = excluded.card_sets_json, price_usd = excluded.price_usd,
      raw_json = excluded.raw_json, updated_at = excluded.updated_at
  `);

export function upsertCards(cards: YgoCard[]): number {
  const stmt = upsertStmt();
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const c of cards) {
      const image = c.card_images?.[0];
      stmt.run({
        id: c.id,
        name: decodeHtmlEntities(c.name),
        type: c.type,
        frame_type: c.frameType ?? null,
        race: c.race ?? null,
        attribute: c.attribute ?? null,
        archetype: c.archetype ?? null,
        atk: c.atk ?? null,
        def: c.def ?? null,
        level: c.level ?? null,
        linkval: c.linkval ?? null,
        linkmarkers: c.linkmarkers ? JSON.stringify(c.linkmarkers) : null,
        scale: c.scale ?? null,
        description: c.desc ?? null,
        banlist_status: c.banlist_info?.ban_tcg ?? null,
        image_url: image?.image_url ?? null,
        image_url_small: image?.image_url_small ?? null,
        card_sets_json: c.card_sets ? JSON.stringify(c.card_sets) : null,
        price_usd: extractPriceUsd(c),
        raw_json: JSON.stringify(c),
        updated_at: now,
      });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return cards.length;
}

export type CardSortKey = "name" | "atk" | "def" | "level" | "price";

const SORT_SQL: Record<CardSortKey, string> = {
  name: "c.name ASC",
  atk: "c.atk DESC NULLS LAST, c.name ASC",
  def: "c.def DESC NULLS LAST, c.name ASC",
  level: "c.level DESC NULLS LAST, c.name ASC",
  price: "c.price_usd DESC NULLS LAST, c.name ASC",
};

export interface CardSearchOptions {
  q?: string;
  type?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  ownedOnly?: boolean;
  sort?: CardSortKey;
  page?: number;
  pageSize?: number;
}

export interface CardSearchResult {
  cards: (Card & { owned_quantity: number })[];
  total: number;
  page: number;
  pageSize: number;
}

export function searchCards(opts: CardSearchOptions): CardSearchResult {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const clauses: string[] = [];
  const params: Record<string, string | number> = {};

  if (opts.q) {
    clauses.push("c.name LIKE @q ESCAPE '\\'");
    params.q = `%${opts.q.replace(/[\\%_]/g, "\\$&")}%`;
  }
  if (opts.type) {
    clauses.push("c.type = @type");
    params.type = opts.type;
  }
  if (opts.race) {
    clauses.push("c.race = @race");
    params.race = opts.race;
  }
  if (opts.attribute) {
    clauses.push("c.attribute = @attribute");
    params.attribute = opts.attribute;
  }
  if (opts.archetype) {
    clauses.push("c.archetype = @archetype");
    params.archetype = opts.archetype;
  }
  if (opts.ownedOnly) {
    clauses.push("COALESCE(uc.quantity, 0) > 0");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = SORT_SQL[opts.sort ?? "name"] ?? SORT_SQL.name;

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as count FROM cards c
       LEFT JOIN user_collection uc ON uc.card_id = c.id
       ${where}`
    )
    .get(params) as unknown as { count: number };

  const rows = db
    .prepare(
      `SELECT c.*, COALESCE(uc.quantity, 0) as owned_quantity FROM cards c
       LEFT JOIN user_collection uc ON uc.card_id = c.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset }) as unknown as (Card & {
    owned_quantity: number;
  })[];

  return { cards: rows, total: totalRow.count, page, pageSize };
}

export function getCardById(id: number): Card | undefined {
  return db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Card | undefined;
}

export function getCardByName(name: string): Card | undefined {
  return db
    .prepare("SELECT * FROM cards WHERE name = ? COLLATE NOCASE")
    .get(name) as Card | undefined;
}

export function getDistinctFilterValues(): {
  types: string[];
  races: string[];
  attributes: string[];
  archetypes: string[];
} {
  const col = (c: string) =>
    (
      db
        .prepare(`SELECT DISTINCT ${c} as v FROM cards WHERE ${c} IS NOT NULL ORDER BY ${c}`)
        .all() as { v: string }[]
    ).map((r) => r.v);
  return {
    types: col("type"),
    races: col("race"),
    attributes: col("attribute"),
    archetypes: col("archetype"),
  };
}

export function countCards(): number {
  return (db.prepare("SELECT COUNT(*) as count FROM cards").get() as { count: number }).count;
}
