import { db, getSyncMeta, setSyncMeta, type MCard } from "../db";
import { fetchLimitRegs, fetchYugipediaIds } from "./dataPacks";
import { httpGetJson } from "./http";
import { recordAllCardPrices, recordPriceSnapshots } from "./priceHistory";
import { rebuildPrintingIndex } from "./rarity";

const CARDINFO_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const DBVER_URL = "https://db.ygoprodeck.com/api/v7/checkDBVer.php";

// Bumped whenever `slim()` starts keeping a new field, so an app update forces
// one full re-pull to backfill it even when the remote DB version is unchanged.
// (v2 added per-card artwork ids.)
const CARDS_SHAPE = "2";

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
  card_images?: { id?: number; image_url_small?: string }[];
  card_prices?: { tcgplayer_price?: string }[];
  card_sets?: { set_code?: string; set_rarity?: string; set_price?: string }[];
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
  // Artwork image ids — kept only when a card has more than one, so the vast
  // majority of single-art cards add no extra data.
  const artIds = (c.card_images ?? [])
    .map((im) => im.id)
    .filter((id): id is number => typeof id === "number");
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
    ...(artIds.length > 1 ? { arts: artIds } : {}),
  };
}

export interface CardSyncResult {
  cardCount: number;
  skipped: boolean;
  // True when the rarity/foil index couldn't be rebuilt — scanning falls back
  // to per-card network lookups until the next successful sync.
  rarityIndexFailed?: boolean;
}

const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;

// Patches Master Duel / Speed Duel regulations and Yugipedia page ids (from
// the CI-built data packs) onto the local card rows in one diff pass.
// Best-effort and throttled — this data moves on a banlist cadence, not
// per-launch. `force` skips the throttle (fresh sync).
const REGS_REFRESH_MS = 3 * 24 * 60 * 60 * 1000;

export async function applyDataPacks(force = false): Promise<boolean> {
  if (!force) {
    const last = Number(await getSyncMeta("limit_regs_at")) || 0;
    if (Date.now() - last < REGS_REFRESH_MS) return true;
  }
  try {
    const [regs, ypIds] = await Promise.all([
      fetchLimitRegs(),
      // The ids pack is a nice-to-have — a failed fetch shouldn't scrub the
      // regulations patch with it.
      fetchYugipediaIds().catch(() => null),
    ]);
    if (Object.keys(regs).length < 1000) return false; // suspicious payload
    const rows = await db.cards.toArray();
    const patched: MCard[] = [];
    for (const row of rows) {
      const entry = regs[String(row.id)];
      const banMd = entry?.md;
      const speedLimit = entry?.speed;
      const ypId = ypIds ? (ypIds[String(row.id)] ?? row.ypId) : row.ypId;
      if (row.banMd !== banMd || row.speedLimit !== speedLimit || row.ypId !== ypId) {
        patched.push({ ...row, banMd, speedLimit, ypId });
      }
    }
    if (patched.length > 0) await db.cards.bulkPut(patched);
    await setSyncMeta("limit_regs_at", String(Date.now()));
    return true;
  } catch {
    return false; // offline / pack not published yet — formats show "no data"
  }
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
    // Version check is best-effort; the freshness fallback below decides.
  }

  const localVersion = (await db.syncMeta.get("cards_db_version"))?.value ?? null;
  const localShape = (await db.syncMeta.get("cards_shape"))?.value ?? null;
  const lastSynced = (await db.syncMeta.get("cards_last_synced_at"))?.value ?? null;
  const cardCount = await db.cards.count();
  const shapeOk = localShape === CARDS_SHAPE && cardCount > 0;
  if (remoteVersion && localVersion === remoteVersion && shapeOk) {
    applyDataPacks().catch(() => {}); // regulations can move without a DB bump
    return { cardCount, skipped: true };
  }
  // Version endpoint down/flaky but data is complete and recent: don't burn a
  // 50 MB download that would almost certainly fetch identical data.
  if (
    !remoteVersion &&
    shapeOk &&
    lastSynced &&
    Date.now() - Date.parse(lastSynced) < DAY_MS_LOCAL
  ) {
    applyDataPacks().catch(() => {});
    return { cardCount, skipped: true };
  }

  onProgress?.("Downloading card database (~50 MB, Wi-Fi recommended)…");
  const payload = await httpGetJson<{ data: ApiCard[] }>(CARDINFO_URL);
  // The API returns {"error": "..."} on failures — surface that readably
  // instead of a raw TypeError from .map on undefined.
  if (!Array.isArray(payload?.data) || payload.data.length === 0) {
    throw new Error("Card database unavailable right now — try again later");
  }
  const cards = payload.data.map(slim);

  onProgress?.(`Saving ${cards.length.toLocaleString()} cards…`);
  await db.cards.bulkPut(cards);
  await setSyncMeta("cards_last_synced_at", new Date().toISOString());
  await setSyncMeta("cards_shape", CARDS_SHAPE);
  if (remoteVersion) await setSyncMeta("cards_db_version", remoteVersion);

  // Build the global rarity/foil index from the same dump (its set lists are
  // otherwise discarded by slim()). Best-effort — a failure here shouldn't
  // fail the whole sync.
  onProgress?.("Indexing rarities…");
  const printingRows: { cardId: number; code: string; rarity: string; price: number | null }[] = [];
  for (const c of payload.data) {
    for (const s of c.card_sets ?? []) {
      if (s.set_code && s.set_rarity) {
        const p = Number.parseFloat(s.set_price ?? "");
        printingRows.push({
          cardId: c.id,
          code: s.set_code,
          rarity: s.set_rarity,
          price: Number.isFinite(p) && p > 0 ? p : null,
        });
      }
    }
  }
  // A failure here shouldn't fail the whole sync, but it must not be silent
  // either — the scanner's rarity lookups depend on this index, and the old
  // swallow meant the UI would advise "re-sync" after a sync that "worked".
  const rarityIndexFailed = await rebuildPrintingIndex(printingRows).then(
    () => false,
    () => true
  );

  // Master Duel / Speed Duel regulations ride the data-pack release, not the
  // YGOPRODeck dump — refresh them with every full sync. Best-effort.
  onProgress?.("Fetching format regulations…");
  await applyDataPacks(true);

  // A sync is the only time local prices change. Snapshot every card's price
  // today (so any card added later already has history), then run the tracked
  // snapshot for its retention prune + launch-gate bookkeeping. Best-effort.
  onProgress?.("Recording prices…");
  await recordAllCardPrices(cards).catch(() => {});
  await recordPriceSnapshots(true).catch(() => {});

  return { cardCount: cards.length, skipped: false, rarityIndexFailed: rarityIndexFailed || undefined };
}
