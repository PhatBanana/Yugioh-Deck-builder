import { rarityBucket, type FoilClass } from "./rarityVision";

// Training-data capture: pure logic for the on-device dataset that will train
// the foil-family classifier (see docs/adr/0001 and CONTEXT.md). The mobile
// service owns pixels and storage; this module owns labels and the cap math,
// so both are unit-testable.

// The classifier's label space: the five visual finishes plus the trained
// abstain class. Identical to FoilClass — the model learns exactly what the
// heuristic foil pass reports today.
export type FoilFamily = FoilClass;

// Where a trusted label came from. Only these two moments produce labels the
// training set accepts: an active user choice, or a set code that maps to
// exactly one printing (a catalog fact). Torch/model confirmations are
// excluded — training on the classifier's own opinions would be circular.
export type CaptureSource = "picker-confirm" | "unambiguous-index";

// Everything recorded alongside a captured example's pixels. `rarity` keeps
// the exact printed name so the dataset can be relabelled if the family
// mapping ever changes; `family` is what training consumes.
export interface CaptureLabel {
  cardId: number;
  setCode: string | null;
  rarity: string;
  family: FoilFamily;
  source: CaptureSource;
  edition?: string;
}

// Maps a printed rarity name to the classifier's label space, or null when
// the rarity's finish is unknown/varies (starfoil, mosaic…) — those printings
// are never captured: a trusted rarity with an untrusted family is not a
// trusted label.
export function foilFamilyFor(rarity: string): FoilFamily | null {
  // Variable-finish families first: rarityBucket would otherwise mislabel
  // e.g. "Duel Terminal Normal Parallel Rare" as matte off its "normal"
  // substring, when parallel foils are anything but. Same family list as
  // the trait table in rarityTraits.ts.
  if (/(starfoil|mosaic|shatterfoil|parallel|duel terminal)/i.test(rarity)) return null;
  const bucket = rarityBucket(rarity);
  if (bucket === "unknown") return null;
  // The bucket vocabulary says "gold" where the class vocabulary says
  // "gold-name" (the gold foil sits on the name plate).
  return bucket === "gold" ? "gold-name" : bucket;
}

// On-device cap for stored examples, oldest-out (≈3–7k full-res crops).
// Export moves the dataset off the phone; the cap only bounds what a phone
// holds between exports.
export const CAPTURE_CAP_BYTES = 1024 * 1024 * 1024; // 1 GiB

export interface StoredExampleSize {
  id: number;
  at: string; // ISO timestamp
  bytes: number;
}

// Which stored examples to evict so that total size (including `incomingBytes`
// about to be written) fits the cap: oldest first, never the incoming one.
// Pure planning — the caller deletes.
export function planEviction(
  stored: StoredExampleSize[],
  incomingBytes: number,
  capBytes: number = CAPTURE_CAP_BYTES
): number[] {
  let total = incomingBytes + stored.reduce((sum, s) => sum + s.bytes, 0);
  if (total <= capBytes) return [];
  const oldestFirst = [...stored].sort((a, b) => a.at.localeCompare(b.at));
  const evict: number[] = [];
  for (const s of oldestFirst) {
    if (total <= capBytes) break;
    evict.push(s.id);
    total -= s.bytes;
  }
  return evict;
}
