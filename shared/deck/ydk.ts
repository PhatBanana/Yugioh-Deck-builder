import type { DeckCard, DeckSection } from "./types";

// .ydk is the de-facto deck interchange format (YGOPRO, EDOPro, Master Duel
// importers, YGOPRODeck). Sections are marked by #main / #extra / !side, then
// one passcode id per line (repeated per copy). Lines starting with # (other
// than the section headers) are comments.

const SECTION_HEADER: Record<DeckSection, string> = {
  main: "#main",
  extra: "#extra",
  side: "!side",
};

export function serializeYdk(cards: DeckCard[], creator = "YGO Deck Builder"): string {
  const lines: string[] = [`#created by ${creator}`];
  for (const section of ["main", "extra", "side"] as const) {
    lines.push(SECTION_HEADER[section]);
    for (const c of cards.filter((x) => x.section === section)) {
      for (let i = 0; i < c.quantity; i++) lines.push(String(c.cardId));
    }
  }
  return lines.join("\n") + "\n";
}

export function parseYdk(text: string): DeckCard[] {
  let section: DeckSection | null = null;
  // Aggregate copies per (section, cardId).
  const counts = new Map<string, DeckCard>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower === "#main") {
      section = "main";
      continue;
    }
    if (lower === "#extra") {
      section = "extra";
      continue;
    }
    if (lower === "!side") {
      section = "side";
      continue;
    }
    // Other #comment lines, or content before any header, are ignored.
    if (line.startsWith("#") || line.startsWith("!") || section === null) continue;
    if (!/^\d+$/.test(line)) continue;

    const cardId = Number(line);
    const key = `${section}:${cardId}`;
    const existing = counts.get(key);
    if (existing) existing.quantity += 1;
    else counts.set(key, { cardId, quantity: 1, section });
  }

  return [...counts.values()];
}
