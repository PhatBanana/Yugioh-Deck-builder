import { db, setSyncMeta, type MCard } from "../db";
import { httpGetJson } from "./http";
import { recordPriceSnapshots } from "./priceHistory";

const CARDINFO_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const DBVER_URL = "https://db.ygoprodeck.com/api/v7/checkDBVer.php";

interface ApiCard {
  id: number;
  name: string;
  type: string;
  desc?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  atk?: number;
  def?: number;
  level?: number;
  banlist_info?: { ban_tcg?: string; ban_ocg?: string; ban_goat?: string };
  card_images?: { image_url_small?: string }[];
  card_prices?: { tcgplayer_price?: string }[];
}

// A couple of names arrive from the API HTML-escaped (same quirk the desktop
// app handles) — decode so display and name lookups work.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function slim(c: ApiCard): MCard {
  const name = decodeHtmlEntities(c.name);
  const rawPrice = c.card_prices?.[0]?.tcgplayer_price;
  const price = rawPrice ? Number.parseFloat(rawPrice) : NaN;
  return {
    id: c.id,
    name,
    nameLower: name.toLowerCase(),
    type: c.type,
    race: c.race ?? null,
    attribute: c.attribute ?? null,
    archetype: c.archetype ?? null,
    atk: c.atk ?? null,
    def: c.def ?? null,
    level: c.level ?? null,
    desc: c.desc ?? "",
    banlist: c.banlist_info?.ban_tcg ?? null,
    banOcg: c.banlist_info?.ban_ocg ?? null,
    banGoat: c.banlist_info?.ban_goat ?? null,
    price: Number.isFinite(price) && price > 0 ? price : null,
    img: c.card_images?.[0]?.image_url_small ?? null,
  };
}

export interface CardSyncResult {
  cardCount: number;
  skipped: boolean;
}

export async function syncCards(
  onProgress?: (message: string) => void
): Promise<CardSyncResult> {
  onProgress?.("Checking database version…");
  let remoteVersion: string | null = null;
  try {
    const ver = await httpGetJson<{ database_version?: string }[]>(DBVER_URL);
    remoteVersion = ver?.[0]?.database_version ?? null;
  } catch {
    // Version check is best-effort; fall through to a full pull.
  }

  const localVersion = (await db.syncMeta.get("cards_db_version"))?.value ?? null;
  const cardCount = await db.cards.count();
  if (remoteVersion && localVersion === remoteVersion && cardCount > 0) {
    return { cardCount, skipped: true };
  }

  onProgress?.("Downloading card database (~50 MB, Wi-Fi recommended)…");
  const payload = await httpGetJson<{ data: ApiCard[] }>(CARDINFO_URL);
  const cards = payload.data.map(slim);

  onProgress?.(`Saving ${cards.length.toLocaleString()} cards…`);
  await db.cards.bulkPut(cards);
  await setSyncMeta("cards_last_synced_at", new Date().toISOString());
  if (remoteVersion) await setSyncMeta("cards_db_version", remoteVersion);

  // A sync is the only time local prices change — refresh today's tracked
  // price points so history reflects the new prices (best-effort).
  await recordPriceSnapshots().catch(() => {});

  return { cardCount: cards.length, skipped: false };
}
