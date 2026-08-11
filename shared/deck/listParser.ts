// Parses a human-readable deck list (the format every deck site and locals
// group chat uses) into named entries with sections:
//
//   Branded Deck            ← optional title line
//   Monsters                ← section headers route what follows
//   3 Fallen of Albaz
//   2x Blazing Cartesia the Virtuous
//   Branded Fusion x2
//   Extra Deck
//   1 Albion the Branded Dragon
//
// Monster/Spell/Trap headers all mean "main deck" — they're how lists are
// written, not deck sections. Card names are NOT validated here; the app
// resolves them against the card database (with fuzzy matching, since typed
// lists carry typos).

import type { DeckSection } from "./types";

export interface ParsedDeckLine {
  raw: string;
  name: string;
  quantity: number;
  section: DeckSection;
}

export interface ParsedDeckList {
  name: string | null; // title line, when the list starts with one
  lines: ParsedDeckLine[];
  sawSections: boolean; // false = flat list, caller may infer extra-deck cards
}

// Section headers as standalone lines: "Monsters", "Spell Cards:", "EXTRA
// DECK (15)", "Side:" … Count suffixes and trailing colons are tolerated.
const SECTION_HEADER =
  /^(main(?:\s+deck)?|monsters?(?:\s+cards?)?|spells?(?:\s+cards?)?|traps?(?:\s+cards?)?|extra(?:\s+deck)?|side(?:\s+deck)?)\s*:?\s*(?:\(?\d+\)?\s*)?$/i;

function sectionFor(header: string): DeckSection {
  const h = header.toLowerCase();
  if (h.startsWith("extra")) return "extra";
  if (h.startsWith("side")) return "side";
  return "main";
}

const MAX_QUANTITY = 3;

export function parseDeckList(text: string): ParsedDeckList {
  const rawLines = text.split(/\r?\n/);
  let name: string | null = null;
  let section: DeckSection = "main";
  let sawSections = false;
  let sawCards = false;
  const lines: ParsedDeckLine[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = line.match(SECTION_HEADER);
    if (header) {
      section = sectionFor(header[1]);
      sawSections = true;
      continue;
    }

    // "3 Name" / "3x Name"
    const leading = line.match(/^(\d{1,2})\s*[xX×]?\s+(.+)$/);
    // "Name x3"
    const trailing = line.match(/^(.+?)\s+[xX×]\s*(\d{1,2})$/);

    if (leading) {
      push(leading[2], Number(leading[1]));
    } else if (trailing) {
      push(trailing[1], Number(trailing[2]));
    } else if (!sawCards && !sawSections && name === null) {
      // A bare line before any cards or headers reads as the deck's title.
      name = line;
    } else {
      push(line, 1);
    }

    function push(cardName: string, quantity: number) {
      const trimmed = cardName.trim();
      if (!trimmed) return;
      sawCards = true;
      // Same card listed twice in a section aggregates (capped at 3).
      const existing = lines.find(
        (l) => l.section === section && l.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
      } else {
        lines.push({
          raw: line,
          name: trimmed,
          quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)),
          section,
        });
      }
    }
  }

  return { name, lines, sawSections };
}
