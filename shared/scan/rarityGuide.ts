// Reference sheet for telling rarities apart by eye — the knowledge that
// normally lives in a forum post, kept next to the moment you need it (the
// scan-time rarity picker).
//
// No public API serves per-rarity example photos: YGOPRODeck returns one
// catalog image per card regardless of printing, and scan archives are
// copyrighted. So each entry describes what to LOOK for and renders a live
// example with the app's own foil emulation (see .foil-* in index.css),
// with a Yugipedia link for anyone wanting real photos.

import { rarityAbbrev } from "./setCode";
import { traitsFor, type RarityTraits } from "./rarityTraits";

export interface RarityGuideEntry {
  /** Canonical rarity name, as printed in card databases. */
  rarity: string;
  abbrev: string;
  /** The one-line "how do I spot this" tell. */
  tell: string;
  /** When you'd encounter it — helps date a card in hand. */
  era: string;
  /** Roughly how often it turns up, in plain words. */
  frequency: string;
  traits: RarityTraits;
}

// Ordered from most to least common — the order you'd flip through when
// working out what you're holding.
const ENTRIES: Omit<RarityGuideEntry, "traits" | "abbrev">[] = [
  {
    rarity: "Common",
    tell: "No foil anywhere. Flat black card name, matte artwork. Tilt it under light and nothing shifts.",
    era: "Every set, always",
    frequency: "Most of every pack",
  },
  {
    rarity: "Rare",
    tell: "Silver holographic name, matte artwork. The name catches light; the art does not — that contrast is the whole tell.",
    era: "Every set, always",
    frequency: "About one per pack",
  },
  {
    rarity: "Super Rare",
    tell: "Holographic artwork with a plain black name. The opposite of a Rare: art shines, name doesn't.",
    era: "Every set, always",
    frequency: "Roughly 1 in 6 packs",
  },
  {
    rarity: "Ultra Rare",
    tell: "Gold foil name plus holographic artwork. Gold lettering is the giveaway — Secrets look silver by comparison.",
    era: "Every set, always",
    frequency: "Roughly 1 in 12 packs",
  },
  {
    rarity: "Secret Rare",
    tell: "Silver name with a fine diagonal glitter across the art that flashes rainbow when tilted. Head-on it can pass for an Ultra with a silver name.",
    era: "Every set since 2002",
    frequency: "Roughly 1 in 24 packs",
  },
  {
    rarity: "Ultimate Rare",
    tell: "Physically embossed — the art, borders and name are raised. Run a thumb over it: texture you can feel, not just see. Often called Relief.",
    era: "2004 onward, not in every set",
    frequency: "Rarer than Secret; set-dependent",
  },
  {
    rarity: "Prismatic Secret Rare",
    tell: "Secret Rare glitter, but the sparkle pattern is coarser and covers the whole card face rather than tracking the art.",
    era: "Mostly 2000s reprints and specials",
    frequency: "Set-dependent",
  },
  {
    rarity: "Gold Rare",
    tell: "Gold everywhere — name, border AND art frame are gold foil, not just the name. Distinctive to Gold Series sets.",
    era: "Gold Series / Premium Gold sets",
    frequency: "Common within those sets",
  },
  {
    rarity: "Collector's Rare",
    tell: "Deep textured foil with a distinct etched pattern; the name reads chrome/rainbow rather than flat gold or silver.",
    era: "2018 onward, TCG specials",
    frequency: "Very rare",
  },
  {
    rarity: "Starlight Rare",
    tell: "Whole card covered in a dense, chunky 'shattered glass' foil — unmistakable and instantly obvious next to anything else.",
    era: "2019 onward",
    frequency: "Extremely rare (~1 in 250+ packs)",
  },
  {
    rarity: "Quarter Century Secret Rare",
    tell: "Secret Rare sparkle plus the 25th-anniversary logo stamp on the card face. The stamp is the certain tell — look for it before judging foil.",
    era: "2023 onward",
    frequency: "Very rare",
  },
  {
    rarity: "Ghost Rare",
    tell: "Pale, washed-out artwork with a 3D-embossed look that seems to float. The art appears faded compared to every other rarity.",
    era: "2007 onward, one per set at most",
    frequency: "Extremely rare",
  },
];

// Abbreviations come from the same helper every chip and picker uses — a
// local copy here once showed "SR" while the rest of the app showed "ScR"
// for the same card (and collapsed Super/Secret to the same label).
export const RARITY_GUIDE: RarityGuideEntry[] = ENTRIES.map((e) => ({
  ...e,
  abbrev: rarityAbbrev(e.rarity),
  traits: traitsFor(e.rarity),
}));

// Yugipedia's own page for a rarity — real photographs, for when the
// description isn't enough. Search rather than a guessed page title, so the
// link can't rot into a 404.
export function guideReferenceUrl(rarity: string): string {
  return `https://yugipedia.com/index.php?search=${encodeURIComponent(rarity)}`;
}

// The guide entry matching a printed rarity string, when there is one — lets
// the picker deep-link straight to the relevant tier.
//
// Printed rarities carry prefixes the guide doesn't list separately
// ("Platinum Secret Rare" → Secret Rare), so an exact miss falls back to
// containment — but the bare "Rare" entry is excluded from that fallback,
// since nearly every rarity name ends in "Rare" and would match it. The
// longest containment wins, so "Secret Rare" beats a shorter overlap.
export function guideEntryFor(rarity: string): RarityGuideEntry | undefined {
  const r = rarity.trim().toLowerCase();
  const exact = RARITY_GUIDE.find((e) => e.rarity.toLowerCase() === r);
  if (exact) return exact;
  return RARITY_GUIDE.filter(
    (e) => e.rarity.toLowerCase() !== "rare" && r.includes(e.rarity.toLowerCase())
  ).sort((a, b) => b.rarity.length - a.rarity.length)[0];
}
