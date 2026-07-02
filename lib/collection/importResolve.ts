import { getCardByName } from "../db/cardsRepo";
import { resolveCardId } from "../ygoprodeck/resolve";
import type { ParsedEntry } from "./importParser";

export interface MatchedEntry {
  cardId: number;
  name: string;
  quantity: number;
}

export interface UnmatchedEntry {
  raw: string;
  reason: string;
}

export interface ResolveResult {
  matched: MatchedEntry[];
  unmatched: UnmatchedEntry[];
}

// Resolves parsed entries against the local card catalog. Name lookups are
// exact (case-insensitive); unknown numeric ids fall back to the live API to
// handle alternate-artwork ids in .ydk files.
export async function resolveImportEntries(entries: ParsedEntry[]): Promise<ResolveResult> {
  const matched = new Map<number, MatchedEntry>();
  const unmatched: UnmatchedEntry[] = [];

  const addMatch = (cardId: number, name: string, quantity: number) => {
    const existing = matched.get(cardId);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity);
    } else {
      matched.set(cardId, { cardId, name, quantity });
    }
  };

  for (const entry of entries) {
    if (entry.cardId != null) {
      const resolved = await resolveCardId(entry.cardId);
      if (resolved) {
        addMatch(resolved.id, resolved.name, entry.quantity);
      } else {
        unmatched.push({ raw: entry.raw, reason: `Unknown card id ${entry.cardId}` });
      }
      continue;
    }

    const byName = getCardByName(entry.name!);
    if (byName) {
      addMatch(byName.id, byName.name, entry.quantity);
      continue;
    }

    // A line like "7 Colored Fish" parses as quantity 7 + "Colored Fish";
    // if that name doesn't resolve, retry the whole raw line as a card name.
    if (entry.raw !== entry.name) {
      const byRawLine = getCardByName(entry.raw);
      if (byRawLine) {
        addMatch(byRawLine.id, byRawLine.name, 1);
        continue;
      }
    }

    unmatched.push({ raw: entry.raw, reason: `No card named "${entry.name}"` });
  }

  return { matched: [...matched.values()], unmatched };
}
