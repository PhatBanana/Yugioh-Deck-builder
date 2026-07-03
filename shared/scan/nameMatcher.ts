// Fuzzy matching of OCR output against the card-name catalog. OCR of a card
// photo yields several text lines (name, type line, effect text…) with
// misread characters; we score every line against every known name and
// return the best candidates for the user to confirm.

export interface NameCandidate {
  id: number;
  name: string;
}

export interface NameMatch {
  id: number;
  name: string;
  score: number; // 0..1, higher is better
}

// Lowercase and strip everything except letters/digits so punctuation,
// spacing and OCR artifacts like stray dots don't affect the comparison.
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Every modern Yu-Gi-Oh! card prints its 8-digit passcode in the bottom-left
// corner, and that number IS the YGOPRODeck card id. Reading it gives an exact
// identification with no name ambiguity. Pull isolated 8-digit runs out of the
// OCR text (ATK/DEF are <=4 digits and set codes aren't 8 plain digits, so
// false positives are rare — and the caller still verifies each against the
// catalog). Leading zeros are dropped so the value matches the numeric id.
export function extractPasscodes(lines: string[]): number[] {
  const ids = new Set<number>();
  for (const line of lines) {
    for (const m of line.matchAll(/(?<!\d)(\d{8})(?!\d)/g)) {
      ids.add(Number(m[1]));
    }
  }
  return [...ids];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  // Cheap containment path: an OCR line often has extra junk around the name.
  if (a.length !== b.length && (a.includes(b) || b.includes(a))) {
    const ratio = Math.min(a.length, b.length) / maxLen;
    return 0.82 + 0.18 * ratio;
  }
  // Skip the expensive comparison when lengths are wildly different.
  if (Math.abs(a.length - b.length) > 0.5 * maxLen) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

export interface MatchOptions {
  limit?: number;
  minScore?: number;
}

export function matchCardName(
  query: string,
  candidates: NameCandidate[],
  options: MatchOptions = {}
): NameMatch[] {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.55;
  const nq = normalizeName(query);
  if (nq.length < 3) return [];

  const matches: NameMatch[] = [];
  for (const c of candidates) {
    const score = similarity(nq, normalizeName(c.name));
    if (score >= minScore) matches.push({ id: c.id, name: c.name, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

// Scores every OCR line, merging results by card so each card keeps its best
// score. Lines nearer the top of the photo get a small boost — the card name
// is printed at the top of a Yu-Gi-Oh! card.
export function matchOcrLines(
  lines: string[],
  candidates: NameCandidate[],
  options: MatchOptions = {}
): NameMatch[] {
  const limit = options.limit ?? 5;
  const best = new Map<number, NameMatch>();

  lines.forEach((line, index) => {
    const positionBoost = Math.max(0, 0.04 - 0.01 * index);
    for (const m of matchCardName(line, candidates, { ...options, limit: 10 })) {
      const score = Math.min(1, m.score + positionBoost);
      const existing = best.get(m.id);
      if (!existing || score > existing.score) {
        best.set(m.id, { ...m, score });
      }
    }
  });

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
