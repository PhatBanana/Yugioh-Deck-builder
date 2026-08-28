// Reads the printed set code and edition marking off a Yu-Gi-Oh! card's OCR
// text, and matches that code to one of the card's known printings so the
// rarity can be inferred.
//
// Rarity (Common / Rare / Super / Ultra / Secret / Starlight …) is a foil
// treatment, never printed as words on the card — so it can't be OCR'd
// directly. The set code (e.g. "SDCB-EN001", printed at the bottom of the
// card) is what identifies *which printing* a physical copy is, and each
// printing has a fixed rarity in the card database. So: read the code, look up
// the printing, and the rarity comes with it.

export interface PrintingRef {
  code: string;
  rarity: string;
}

// The two-letter region code that sits between the set prefix and the card
// number (the "EN" in "SDCB-EN001"). Stripped when comparing codes so a scan
// still matches if the region was misread, or if the stored printing is from a
// different region than the physical copy.
const REGIONS = new Set([
  "EN", "FR", "DE", "IT", "PT", "SP", "EU", "AE", "AU", "JP", "JA", "KR", "TC", "SC",
]);

// Canonical form for comparing two set codes: uppercase, region removed, and
// the card number stripped of zero-padding — so "SDCB-EN001", "SDCB-001" and
// "SDCB-EN1" all collapse to the same key.
export function canonSetCode(code: string): string {
  const up = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const dash = up.indexOf("-");
  if (dash <= 0) return up;
  const prefix = up.slice(0, dash);
  let rest = up.slice(dash + 1);
  // Drop a leading 2-letter region when it's followed by the card number
  // (optionally a single letter like the "C" in "ENC01", then a digit).
  const region = rest.match(/^([A-Z]{2})(?=[A-Z]?\d)/);
  if (region && REGIONS.has(region[1])) rest = rest.slice(2);
  // Normalise the first digit run so leading zeros don't matter.
  rest = rest.replace(/\d+/, (d) => String(Number(d)));
  return `${prefix}-${rest}`;
}

// Pulls a set-code-shaped token out of OCR lines. A set code is a short set
// prefix, a hyphen, and a card number whose suffix contains at least one digit
// (which rules out hyphenated card names like "BLUE-EYES" or "XYZ-DRAGON").
// Spaces the OCR may insert around the hyphen are removed first. Returns the
// raw matched token (uppercased), or null.
export function extractSetCode(lines: string[]): string | null {
  const re = /\b([A-Z0-9]{2,6})-([A-Z]{0,3}\d[A-Z0-9]{0,4})\b/;
  for (const line of lines) {
    const cleaned = line.toUpperCase().replace(/\s*-\s*/g, "-");
    const m = cleaned.match(re);
    if (m) return `${m[1]}-${m[2]}`;
  }
  return null;
}

// Detects the edition marking printed under the artwork. Unlimited copies
// carry no marking, so its absence is left undefined (an OCR miss is
// indistinguishable from a genuinely unmarked card).
export function detectEdition(lines: string[]): string | undefined {
  const text = lines.join(" ").toUpperCase();
  // OCR often reads the leading "1" of "1st" as "I".
  if (/\b(?:1ST|IST|FIRST)\s*EDITION\b/.test(text)) return "1st Edition";
  if (/\bLIMITED\s*EDITION\b/.test(text)) return "Limited Edition";
  return undefined;
}

// Collectors' shorthand for a rarity, for tight spaces like the scan strip
// ("Secret Rare" → "ScR"). Falls back to the first letters of each word.
const RARITY_ABBREV: Record<string, string> = {
  common: "C",
  "short print": "SP",
  rare: "R",
  "super rare": "SR",
  "ultra rare": "UR",
  "ultimate rare": "UtR",
  "secret rare": "ScR",
  "prismatic secret rare": "PScR",
  "ultra secret rare": "UScR",
  "ghost rare": "GR",
  "gold rare": "GUR",
  "starlight rare": "StR",
  "collector's rare": "CR",
  "quarter century secret rare": "QCScR",
};

export function rarityAbbrev(rarity: string): string {
  const key = rarity.trim().toLowerCase();
  if (RARITY_ABBREV[key]) return RARITY_ABBREV[key];
  return rarity
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Every printing whose code matches the OCR'd set code (region- and
// zero-pad-insensitive). Usually one; more than one means the card was offered
// at several rarities in the same set, which a visual second pass can then
// disambiguate.
export function matchPrintingCandidates(
  ocrCode: string | null | undefined,
  printings: PrintingRef[]
): PrintingRef[] {
  if (!ocrCode) return [];
  const wantCanon = canonSetCode(ocrCode);
  return printings.filter((p) => canonSetCode(p.code) === wantCanon);
}

