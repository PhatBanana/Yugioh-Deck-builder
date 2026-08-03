import type { DeckCard, DeckSection } from "./types";

// A compact, copy-pasteable deck code for sharing decks by text (no file). The
// format is human-inspectable and needs no base64, so it survives being pasted
// through chat apps. Example:
//   YGO1|My%20Deck|M:12345*3,67890*1|E:55555*2|S:
//
// YGO1 = version tag; the deck name is URL-encoded; each section lists
// `cardId*quantity` pairs. Round-trips with decodeDeckCode.

const TAG = "YGO1";
const SEC_TAG: Record<DeckSection, string> = { main: "M", extra: "E", side: "S" };
const TAG_SEC: Record<string, DeckSection> = { M: "main", E: "extra", S: "side" };

export function encodeDeckCode(name: string, cards: DeckCard[]): string {
  const parts = [TAG, encodeURIComponent(name.trim() || "Deck")];
  for (const section of ["main", "extra", "side"] as const) {
    const items = cards
      .filter((c) => c.section === section && c.quantity > 0)
      .map((c) => `${c.cardId}*${c.quantity}`);
    parts.push(`${SEC_TAG[section]}:${items.join(",")}`);
  }
  return parts.join("|");
}

export interface DecodedDeck {
  name: string;
  cards: DeckCard[];
}

// Parses a deck code back into a name + cards, or null if it isn't a valid
// code. Quantities are clamped to the 3-per-card limit; malformed tokens are
// skipped rather than failing the whole import.
export function decodeDeckCode(code: string): DecodedDeck | null {
  const parts = code.trim().split("|");
  if (parts[0] !== TAG || parts.length < 2) return null;

  let name = "Shared Deck";
  try {
    name = decodeURIComponent(parts[1]).trim() || name;
  } catch {
    // Leave the default when the name segment is malformed.
  }

  // Aggregate per (section, cardId) so duplicate tokens (crafted or mangled
  // codes) merge into one entry instead of smuggling in extra copies — the
  // clamp applies to the summed quantity.
  const counts = new Map<string, DeckCard>();
  for (const seg of parts.slice(2)) {
    const colon = seg.indexOf(":");
    if (colon < 0) continue;
    const section = TAG_SEC[seg.slice(0, colon)];
    const body = seg.slice(colon + 1);
    if (!section || !body) continue;
    for (const tok of body.split(",")) {
      if (!tok) continue;
      const [idS, qtyS] = tok.split("*");
      const id = Number(idS);
      const qty = Number(qtyS);
      if (Number.isInteger(id) && id > 0 && Number.isInteger(qty) && qty > 0) {
        const key = `${section}:${id}`;
        const existing = counts.get(key);
        if (existing) existing.quantity = Math.min(3, existing.quantity + qty);
        else counts.set(key, { cardId: id, quantity: Math.min(3, qty), section });
      }
    }
  }
  const cards = [...counts.values()];
  return cards.length > 0 ? { name, cards } : null;
}
