// Transforms yaml-yugi's aggregate card dump (DawnbrandBots/yaml-yugi) into
// the tiny indices the app actually downloads ("data packs", built by CI —
// the raw aggregate is far too large to parse on a phone). Pure and
// defensive: yaml-yugi is an external schema, so unknown/missing fields must
// degrade to "no entry", never throw.

// The subset of a yaml-yugi card entry these transforms read.
export interface YamlYugiCard {
  password?: number | null;
  konami_id?: number | null;
  name?: Record<string, string | null | undefined> | null;
  limit_regulation?: Record<string, string | null | undefined> | null;
  master_duel_rarity?: string | null;
  yugipedia_page_id?: number | null;
}

// Maps yaml-yugi's regulation words onto the app's banlist strings (matching
// what YGOPRODeck uses for TCG/OCG, so `maxCopies` reads them unchanged).
//
// Two vocabularies share this function. Standard formats use Forbidden /
// Limited / Semi-Limited; Speed Duel instead uses a "Limit 1/2/3" ladder,
// where the number IS the copy allowance — so "Limited 1" is a 1-per-deck
// card (our "Limited"), "Limited 2" allows two ("Semi-Limited"), and
// "Limited 3" allows a full playset (no restriction to record).
//
// "Unlimited", "Not yet released" and anything unrecognized → null (fail open
// — a wrongly-permissive list beats a deck editor that cries wolf).
export function mapRegulation(value: string | null | undefined): string | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "forbidden":
      return "Banned";
    case "limited":
    case "limited 1":
      return "Limited";
    case "semi-limited":
    case "limited 2":
      return "Semi-Limited";
    default:
      return null;
  }
}

// Per-card format data, keyed by password (the id the app's card DB uses). A
// key is present under `md`/`speed` ONLY when the card exists in that
// format's pool — absence means "not in this format", which is the whole
// point for Speed Duel's ~1,200-card pool and Master Duel's omissions.
//
// NOTE on `md`: yaml-yugi carries no Master Duel Forbidden/Limited list — it
// only says whether the card is in the game (via master_duel_rarity). So `md`
// is present-but-null for every Master Duel card: pool membership is real
// data, copy limits are not. The deck editor must not imply otherwise.
export interface LimitRegEntry {
  md?: string | null; // in Master Duel; value is null (no F/L data upstream)
  speed?: string | null; // in the Speed Duel pool; null = no copy restriction
}

export function buildLimitRegs(cards: YamlYugiCard[]): Record<string, LimitRegEntry> {
  const out: Record<string, LimitRegEntry> = {};
  for (const c of cards) {
    if (c.password == null) continue;
    const entry: LimitRegEntry = {};
    const reg = c.limit_regulation ?? {};
    // In Master Duel when the game lists an in-game rarity for it. The
    // `master_duel` regulation key doesn't exist upstream today; it's read
    // anyway so the pack gains real limits for free if it ever appears.
    if (c.master_duel_rarity != null || reg.master_duel !== undefined) {
      entry.md = mapRegulation(reg.master_duel);
    }
    // In the Speed Duel pool when a speed regulation key exists at all.
    if (reg.speed !== undefined) {
      entry.speed = mapRegulation(reg.speed);
    }
    if (entry.md !== undefined || entry.speed !== undefined) {
      out[String(c.password)] = entry;
    }
  }
  return out;
}

// password → localized name, for one language. Skips cards without a name in
// that language; identical-to-English names are kept (harmless, tiny).
export function buildLangPack(cards: YamlYugiCard[], lang: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cards) {
    if (c.password == null) continue;
    const name = c.name?.[lang];
    if (typeof name === "string" && name.trim()) out[String(c.password)] = name.trim();
  }
  return out;
}

// password → Yugipedia page id, for rulings/errata deep links.
export function buildYugipediaIds(cards: YamlYugiCard[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) {
    if (c.password == null || c.yugipedia_page_id == null) continue;
    out[String(c.password)] = c.yugipedia_page_id;
  }
  return out;
}
