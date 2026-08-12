// Observable rarity traits — the things a person can actually answer by
// looking at the card in their hand ("is the name gold or silver?", "is the
// art shiny?", "is it embossed?"), and the mapping from each printed rarity
// to what those answers should be. Powers the rarity picker's narrowing
// checkboxes, and lets the camera's foil read pre-answer the easy ones
// (silver vs gold name plates are exactly what a phone camera CAN see).
//
// Deliberately fail-open: a rarity with an unknown trait is never filtered
// out by that trait, and the UI dims non-matching candidates rather than
// hiding them — the mapping is a guide, not an oracle.

import type { FoilClass } from "./rarityVision";

export type NameFinish = "plain" | "silver" | "gold" | "rainbow";

export interface RarityTraits {
  name?: NameFinish; // undefined = unknown or varies across printings
  artFoiled?: boolean;
  embossed?: boolean; // raised 3D relief (Ultimate Rare)
}

export type TraitAnswers = RarityTraits;

// Keyword table, most specific first. "Secret" names read as silver — the
// letters color-shift at an angle, but head-on they look silver; "rainbow"
// is reserved for the loud whole-name treatments (Quarter Century,
// Starlight, Collector's).
const TABLE: [RegExp, RarityTraits][] = [
  [/quarter\s*century/, { name: "rainbow", artFoiled: true, embossed: false }],
  [/starlight/, { name: "rainbow", artFoiled: true, embossed: false }],
  [/collector/, { name: "rainbow", artFoiled: true, embossed: false }],
  [/gold secret/, { name: "gold", artFoiled: true, embossed: false }],
  [/(prismatic|platinum)/, { name: "silver", artFoiled: true, embossed: false }],
  [/secret/, { name: "silver", artFoiled: true, embossed: false }],
  [/ultimate/, { name: "gold", artFoiled: true, embossed: true }],
  [/ghost/, { name: "silver", artFoiled: true, embossed: false }],
  [/gold/, { name: "gold", artFoiled: true, embossed: false }],
  [/ultra/, { name: "gold", artFoiled: true, embossed: false }],
  [/super/, { name: "plain", artFoiled: true, embossed: false }],
  // Parallel/textured foils cover the whole card; the name treatment varies.
  [/(starfoil|mosaic|shatterfoil|parallel|duel terminal)/, { artFoiled: true }],
  [/(common|short print|normal)/, { name: "plain", artFoiled: false, embossed: false }],
  // Plain "Rare" (silver name only) must match exactly — a substring match
  // would claim these traits for any unknown future "… Rare" name, which
  // should fail open instead.
  [/^rare$/, { name: "silver", artFoiled: false, embossed: false }],
];

export function traitsFor(rarity: string): RarityTraits {
  const r = rarity.toLowerCase();
  for (const [re, traits] of TABLE) {
    if (re.test(r)) return traits;
  }
  return {};
}

// Whether a rarity is consistent with the user's answers so far. Unknown
// traits never disqualify.
export function matchesTraits(rarity: string, answers: TraitAnswers): boolean {
  const t = traitsFor(rarity);
  if (answers.name !== undefined && t.name !== undefined && t.name !== answers.name) return false;
  if (
    answers.artFoiled !== undefined &&
    t.artFoiled !== undefined &&
    t.artFoiled !== answers.artFoiled
  )
    return false;
  if (answers.embossed !== undefined && t.embossed !== undefined && t.embossed !== answers.embossed)
    return false;
  return true;
}

// Which questions are worth asking for THIS candidate set — a question only
// helps when the candidates disagree on its answer.
export interface UsefulQuestions {
  name: boolean;
  artFoiled: boolean;
  embossed: boolean;
}

export function usefulQuestions(rarities: string[]): UsefulQuestions {
  const traits = rarities.map(traitsFor);
  const distinct = <K extends keyof RarityTraits>(key: K) =>
    new Set(traits.map((t) => t[key]).filter((v) => v !== undefined)).size > 1;
  return {
    name: distinct("name"),
    artFoiled: distinct("artFoiled"),
    embossed: distinct("embossed"),
  };
}

// The camera's one-frame foil read, translated into pre-answers. Conservative:
// only claims what a single frame genuinely supports — a gold or silver name
// plate. Whole-card reads ("rainbow", "holo-art") only say the art is foiled;
// "matte" claims nothing, because a frame without glints may just be badly lit.
export function foilToAnswers(foil: FoilClass | undefined): TraitAnswers {
  switch (foil) {
    case "gold-name":
      return { name: "gold" };
    case "holo-name":
      return { name: "silver" };
    case "holo-art":
    case "rainbow":
      return { artFoiled: true };
    default:
      return {};
  }
}
