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

// Maps yaml-yugi's lowercase regulation words onto the app's banlist strings
// (matching what YGOPRODeck uses for TCG/OCG). Unlimited → null; anything
// unrecognized → null (fail open — a wrongly-permissive list beats a deck
// editor that cries wolf).
export function mapRegulation(value: string | null | undefined): string | null {
  switch ((value ?? "").toLowerCase()) {
    case "forbidden":
      return "Banned";
    case "limited":
      return "Limited";
    case "semi-limited":
      return "Semi-Limited";
    default:
      return null;
  }
}

// Per-card format regulations, keyed by password (the id the app's card DB
// uses). A key is present under `md`/`speed` ONLY when the card exists in
// that format's pool — absence means "not in this format", which matters for
// Speed Duel's small pool.
export interface LimitRegEntry {
  md?: string | null; // in Master Duel; null = unlimited
  speed?: string | null; // in the Speed Duel pool; null = unlimited
}

export function buildLimitRegs(cards: YamlYugiCard[]): Record<string, LimitRegEntry> {
  const out: Record<string, LimitRegEntry> = {};
  for (const c of cards) {
    if (c.password == null) continue;
    const entry: LimitRegEntry = {};
    const reg = c.limit_regulation ?? {};
    // In Master Duel when the game lists a rarity for it (or an explicit
    // master_duel regulation exists).
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
