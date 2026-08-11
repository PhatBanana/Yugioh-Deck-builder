import { parseDeckList, type ParsedDeckLine } from "@shared/deck/listParser";
import { matchCardName } from "@shared/scan/nameMatcher";
import type { DeckCard, DeckSection } from "@shared/deck/types";
import { db, type MCard } from "../db";
import { getNameCandidates } from "./scanner";
import { searchCardIds } from "./cardSearch";
import { saveDeckFromYdk } from "./decks";

// Resolves a pasted deck list (names, possibly misspelled) against the card
// database. Exact name matches are taken as-is; misses go through the same
// fuzzy matcher the scanner uses, so "Mirriorjade" still finds Mirrorjade.
// Every line carries the resolved card's art and final section so the
// preview can show exactly what will be imported — and each pick can be
// swapped by hand before anything saves.

export interface ResolvedLine {
  line: ParsedDeckLine;
  cardId?: number;
  matchedName?: string; // resolved card's real name
  img?: string | null; // resolved card's art, for the visual preview
  section: DeckSection; // final section (listed section + card-type inference)
  how: "exact" | "fuzzy" | "manual" | "missing";
}

export interface DeckListPreview {
  name: string | null;
  resolved: ResolvedLine[];
}

const EXTRA_TYPES = /(Fusion|Synchro|Xyz|Link)/i;

// Fusion/Synchro/Xyz/Link cards belong in the Extra Deck even when a list
// files them under "Monsters" (or has no headers at all).
export function finalSection(listed: DeckSection, cardType: string | undefined): DeckSection {
  if (listed === "main" && cardType && EXTRA_TYPES.test(cardType)) return "extra";
  return listed;
}

export async function previewDeckList(text: string): Promise<DeckListPreview> {
  const parsed = parseDeckList(text);
  const names = parsed.lines.map((l) => l.name.toLowerCase());
  const exact = await db.cards.where("nameLower").anyOf(names).toArray();
  const byLower = new Map(exact.map((c) => [c.nameLower, c]));
  // Candidates loaded once, only if something needs fuzzy matching.
  let candidates: Awaited<ReturnType<typeof getNameCandidates>> | null = null;

  const resolved: ResolvedLine[] = [];
  for (const line of parsed.lines) {
    let card = byLower.get(line.name.toLowerCase());
    let how: ResolvedLine["how"] = "exact";
    if (!card) {
      candidates ??= await getNameCandidates();
      const [top] = matchCardName(line.name, candidates, { limit: 1, minScore: 0.55 });
      card = top ? await db.cards.get(top.id) : undefined;
      how = "fuzzy";
    }
    if (card) {
      resolved.push({
        line,
        cardId: card.id,
        matchedName: card.name,
        img: card.img,
        section: finalSection(line.section, card.type),
        how,
      });
    } else {
      resolved.push({ line, section: line.section, how: "missing" });
    }
  }

  return { name: parsed.name, resolved };
}

// Re-points one preview line at a hand-picked card (fixing a wrong fuzzy
// guess or resolving a not-found line). Pure — returns the updated array.
export function repickLine(resolved: ResolvedLine[], index: number, card: MCard): ResolvedLine[] {
  return resolved.map((r, i) =>
    i === index
      ? {
          ...r,
          cardId: card.id,
          matchedName: card.name,
          img: card.img,
          section: finalSection(r.line.section, card.type),
          how: "manual",
        }
      : r
  );
}

// Card search for the preview's fix-a-match picker: substring matches first
// (name index, includes installed language packs); when the typed text is too
// mangled for substring, fall back to the fuzzy matcher so typos still find
// their card here too.
export async function searchCardsForPicker(q: string, limit = 15): Promise<MCard[]> {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  const ids = [...(await searchCardIds(query))];
  let cards = (await db.cards.bulkGet(ids)).filter((c): c is MCard => !!c);
  cards.sort((a, b) => a.name.localeCompare(b.name));
  if (cards.length === 0) {
    const fuzzy = matchCardName(q, await getNameCandidates(), { limit, minScore: 0.4 });
    cards = (await db.cards.bulkGet(fuzzy.map((f) => f.id))).filter((c): c is MCard => !!c);
  }
  return cards.slice(0, limit);
}

// Saves the resolved lines as a new deck (skipping unmatched lines).
export async function importDeckList(resolved: ResolvedLine[], deckName: string) {
  const merged = new Map<string, DeckCard>();
  for (const r of resolved) {
    if (r.cardId == null) continue;
    const key = `${r.cardId}:${r.section}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.min(3, existing.quantity + r.line.quantity);
    else merged.set(key, { cardId: r.cardId, quantity: r.line.quantity, section: r.section });
  }
  return saveDeckFromYdk(deckName, [...merged.values()]);
}
