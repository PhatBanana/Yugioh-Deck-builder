import type { DeckSection } from "../recommendation/types";

// Classifies a deck's play-style. Deck *titles* are unreliable (most modern
// decks don't name a strategy, and "Beatdown"/"Beats" is a noisy casual-title
// word), so we classify primarily from the deck's actual composition — trap
// ratio, burn/stall/mill staples, monster density — falling back to the era.

export interface StrategyCardInfo {
  name: string;
  type: string; // e.g. "Trap Card", "Effect Monster", "Spell Card"
  atk: number | null;
  quantity: number;
  section: DeckSection;
}

export const STRATEGIES = ["Combo", "Control", "Aggro", "Burn", "Stall", "Mill", "FTK/OTK"];

// Explicit, intentional style words in a deck title (no noisy "beatdown/beats").
const NAME_RULES: { strategy: string; pattern: RegExp }[] = [
  { strategy: "FTK/OTK", pattern: /\b(ftk|otk)\b/i },
  { strategy: "Burn", pattern: /\bburn\b/i },
  { strategy: "Mill", pattern: /\bmill\b/i },
  { strategy: "Stall", pattern: /\b(stall|stun|lockdown)\b/i },
  { strategy: "Control", pattern: /\bcontrol\b/i },
  { strategy: "Aggro", pattern: /\baggro\b/i },
  { strategy: "Combo", pattern: /\bcombo\b/i },
];

export function strategyFromName(name: string): string | null {
  for (const { strategy, pattern } of NAME_RULES) if (pattern.test(name)) return strategy;
  return null;
}

// Well-known staples that signal a strategy regardless of title (lowercased).
const BURN_CARDS = new Set([
  "lava golem", "just desserts", "secret barrel", "wave-motion cannon", "ceasefire",
  "chain strike", "ojama trio", "stealth bird", "des koala", "cauldron of the old man",
  "poison of the old man", "tremendous fire", "hinotama", "sparks", "final flame",
  "ookazi", "restructer revolution", "dark room of nightmare", "minefield eruption",
  "meteor of destruction", "magic cylinder", "accumulated fortune", "wave motion cannon",
]);
const STALL_CARDS = new Set([
  "marshmallon", "spirit reaper", "level limit - area b", "gravity bind",
  "messenger of peace", "swords of revealing light", "waboku", "threatening roar",
  "scrap-iron scarecrow", "nightmare wheel", "wall of disruption", "battle fader",
  "swift scarecrow", "the winged dragon of ra - sphere mode", "gozen match",
  "rivalry of warlords", "mask of restrict",
]);
const MILL_CARDS = new Set([
  "card destruction", "that grass looks greener", "reasoning", "monster gate",
  "morphing jar", "dark world dealings", "magical mallet", "foolish burial goods",
]);

// Templated "how it plays" explanation per strategy. {keys} is replaced with
// the deck's key cards so the text names what to actually dig for.
const STRATEGY_PLAYBOOK: Record<string, string> = {
  Combo:
    "Combo deck — the goal is a big turn 1. Open by searching/summoning {keys}, chain their effects into your extra-deck boss monsters, and end your turn with interruption ready. Mulligan priority: any one-card starter that finds {keys}.",
  Control:
    "Control deck — win the long game. Set traps and interruption early, trade one-for-one with the opponent's plays, and land {keys} once their resources are spent. Don't overextend into board wipes.",
  Aggro:
    "Aggro deck — pressure from turn 1. Summon your strongest attackers ({keys}) as fast as possible and force the opponent to answer them. Keep swinging; card advantage matters less than tempo.",
  Burn:
    "Burn deck — win with effect damage, not battle. Stall the board and chip life points with your burn cards; {keys} do the heavy lifting. Protect your stall pieces and count damage to 8000.",
  Stall:
    "Stall/stun deck — lock the game down. Keep floodgates and defensive cards like {keys} on the field so the opponent can't play, then win slowly with a protected attacker or the clock.",
  Mill:
    "Mill deck — empty their deck or fuel your graveyard. Cycle draw/mill effects fast ({keys} are core), keep defense up, and win through deck-out or a graveyard-powered swing turn.",
  "FTK/OTK":
    "FTK/OTK deck — one explosive turn. Every card either finds the combo or is the combo: assemble {keys} as fast as possible and take the whole game in a single turn. Practice the line in the hand tester.",
};

const GENERIC_PLAYBOOK =
  "Build around the key cards: open hands that find {keys}, summon them early, and use the rest of the deck to protect and recycle them.";

// One-paragraph game-plan blurb for a deck: how it expects to play out and
// which cards to get onto the field. Key names are truncated to three.
export function strategyBlurb(strategy: string | null, keyCardNames: string[]): string {
  const template = (strategy && STRATEGY_PLAYBOOK[strategy]) || GENERIC_PLAYBOOK;
  const unique = [...new Set(keyCardNames)].slice(0, 3);
  const keys = unique.length > 0 ? unique.join(", ") : "your boss monsters";
  return template.replaceAll("{keys}", keys);
}

export function classifyStrategy(
  deckName: string,
  cards: StrategyCardInfo[],
  era: string | null
): string | null {
  const named = strategyFromName(deckName);
  if (named) return named;

  const main = cards.filter((c) => c.section === "main");
  const total = main.reduce((n, c) => n + c.quantity, 0);
  if (total === 0) return era === "Modern" ? "Combo" : null;

  let traps = 0;
  let monsters = 0;
  let burn = 0;
  let stall = 0;
  let mill = 0;
  for (const c of main) {
    const q = c.quantity;
    const t = c.type.toLowerCase();
    if (t.includes("trap")) traps += q;
    else if (t.includes("monster")) monsters += q;
    const ln = c.name.toLowerCase();
    if (BURN_CARDS.has(ln) || /\bburn\b/.test(ln)) burn += q;
    if (STALL_CARDS.has(ln)) stall += q;
    if (MILL_CARDS.has(ln)) mill += q;
  }
  const trapRatio = traps / total;
  const monsterRatio = monsters / total;

  if (burn >= 3) return "Burn";
  if (mill >= 3) return "Mill";
  if (stall >= 3) return "Stall";
  if (trapRatio >= 0.28) return "Control"; // trap-heavy = control/floodgate
  if (monsterRatio >= 0.5) return era === "Modern" ? "Combo" : "Aggro";
  return era === "Modern" ? "Combo" : null;
}
