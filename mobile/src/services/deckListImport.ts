import { parseDeckList, type ParsedDeckLine } from "@shared/deck/listParser";
import { matchCardName } from "@shared/scan/nameMatcher";
import type { DeckCard, DeckSection } from "@shared/deck/types";
import { db, type MCard } from "../db";
import { getNameCandidates } from "./scanner";
import { saveDeckFromYdk } from "./decks";

// Resolves a pasted deck list (names, possibly misspelled) against the card
// database. Exact name matches are taken as-is; misses go through the same
// fuzzy matcher the scanner uses, so "Mirriorjade" still finds Mirrorjade —
// but each fuzzy pick is reported so the preview can show what it decided.

export interface ResolvedLine {
  line: ParsedDeckLine;
  cardId?: number;
  matchedName?: string; // resolved card's real name
  how: "exact" | "fuzzy" | "missing";
}

export interface DeckListPreview {
  name: string | null;
  resolved: ResolvedLine[];
  exactCount: number;
  fuzzyCount: number;
  missingCount: number;
}

const EXTRA_TYPES = /(Fusion|Synchro|Xyz|Link)/i;

export async function previewDeckList(text: string): Promise<DeckListPreview> {
  const parsed = parseDeckList(text);
  const names = parsed.lines.map((l) => l.name.toLowerCase());
  const exact = await db.cards.where("nameLower").anyOf(names).toArray();
  const byLower = new Map(exact.map((c) => [c.nameLower, c]));
  // Candidates loaded once, only if something needs fuzzy matching.
  let candidates: Awaited<ReturnType<typeof getNameCandidates>> | null = null;

  const resolved: ResolvedLine[] = [];
  for (const line of parsed.lines) {
    const hit = byLower.get(line.name.toLowerCase());
    if (hit) {
      resolved.push({ line, cardId: hit.id, matchedName: hit.name, how: "exact" });
      continue;
    }
    candidates ??= await getNameCandidates();
    const [top] = matchCardName(line.name, candidates, { limit: 1, minScore: 0.55 });
    if (top) {
      resolved.push({ line, cardId: top.id, matchedName: top.name, how: "fuzzy" });
    } else {
      resolved.push({ line, how: "missing" });
    }
  }

  return {
    name: parsed.name,
    resolved,
    exactCount: resolved.filter((r) => r.how === "exact").length,
    fuzzyCount: resolved.filter((r) => r.how === "fuzzy").length,
    missingCount: resolved.filter((r) => r.how === "missing").length,
  };
}

// Saves the resolved lines as a new deck. The listed section wins; a flat
// list without headers still files Fusion/Synchro/Xyz/Link cards to the
// Extra Deck by card type.
export async function importDeckList(preview: DeckListPreview, deckName: string) {
  const ids = preview.resolved.filter((r) => r.cardId != null).map((r) => r.cardId!);
  const cards = await db.cards.bulkGet(ids);
  const typeById = new Map<number, MCard | undefined>(ids.map((id, i) => [id, cards[i]]));

  const merged = new Map<string, DeckCard>();
  for (const r of preview.resolved) {
    if (r.cardId == null) continue;
    let section: DeckSection = r.line.section;
    if (section === "main" && EXTRA_TYPES.test(typeById.get(r.cardId)?.type ?? "")) {
      section = "extra";
    }
    const key = `${r.cardId}:${section}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.min(3, existing.quantity + r.line.quantity);
    else merged.set(key, { cardId: r.cardId, quantity: r.line.quantity, section });
  }
  return saveDeckFromYdk(deckName, [...merged.values()]);
}
