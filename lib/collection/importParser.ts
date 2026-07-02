// Parses user-supplied collection lists into card entries. Supported formats:
//
// Plain text, one card per line:
//   3x Ash Blossom & Joyous Spring
//   3 Ash Blossom & Joyous Spring
//   Ash Blossom & Joyous Spring x3
//   Ash Blossom & Joyous Spring        (quantity 1)
//
// .ydk deck files: numeric card ids, one per line, with #main/#extra/!side
//   section markers and # comments. Duplicate ids aggregate.
//
// JSON backups exported by this app: [{ "name": ..., "quantity": ... }] or
//   { "cards": [...] }, entries may carry cardId and/or name.

export interface ParsedEntry {
  raw: string;
  cardId?: number;
  name?: string;
  quantity: number;
}

const MAX_QUANTITY = 99;

function aggregate(entries: ParsedEntry[]): ParsedEntry[] {
  const byKey = new Map<string, ParsedEntry>();
  for (const e of entries) {
    const key = e.cardId != null ? `id:${e.cardId}` : `name:${e.name!.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + e.quantity);
    } else {
      byKey.set(key, { ...e, quantity: Math.min(MAX_QUANTITY, e.quantity) });
    }
  }
  return [...byKey.values()];
}

function parseJson(text: string): ParsedEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { cards?: unknown }).cards)
      ? (data as { cards: unknown[] }).cards
      : null;
  if (!list) return null;

  const entries: ParsedEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { cardId, name, quantity } = item as {
      cardId?: unknown;
      name?: unknown;
      quantity?: unknown;
    };
    const qty =
      typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
    if (typeof cardId === "number" && Number.isInteger(cardId) && cardId > 0) {
      entries.push({ raw: JSON.stringify(item), cardId, quantity: qty });
    } else if (typeof name === "string" && name.trim()) {
      entries.push({ raw: JSON.stringify(item), name: name.trim(), quantity: qty });
    }
  }
  return entries;
}

export function parseImportText(text: string): ParsedEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const fromJson = parseJson(trimmed);
  if (fromJson) return aggregate(fromJson);

  const entries: ParsedEntry[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // .ydk section markers ("#main", "!side") and comments.
    if (line.startsWith("#") || line.startsWith("!")) continue;

    // Bare numeric id (.ydk format) — one line per copy.
    if (/^\d+$/.test(line)) {
      entries.push({ raw: line, cardId: Number(line), quantity: 1 });
      continue;
    }

    // "3x Name" or "3 Name"
    const leading = line.match(/^(\d{1,2})\s*[xX×]?\s+(.+)$/);
    // "Name x3"
    const trailing = line.match(/^(.+?)\s+[xX×]\s*(\d{1,2})$/);

    if (leading) {
      entries.push({ raw: line, name: leading[2].trim(), quantity: Number(leading[1]) });
    } else if (trailing) {
      entries.push({ raw: line, name: trailing[1].trim(), quantity: Number(trailing[2]) });
    } else {
      entries.push({ raw: line, name: line, quantity: 1 });
    }
  }
  return aggregate(entries);
}
