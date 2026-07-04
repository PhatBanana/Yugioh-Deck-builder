// Derives a deck's play-style ("strategy") from its name. YGOPRODeck deck
// titles for format decks usually carry the strategy word ("Goat Burn
// Control", "Stun", "Mill FTK"). Modern archetype decks often don't name a
// strategy, so this returns null for them — the UI shows those as "Other".

// Ordered by specificity so a "Burn Control" title tags as Burn (the more
// defining strategy) before Control.
const STRATEGY_RULES: { strategy: string; pattern: RegExp }[] = [
  { strategy: "FTK/OTK", pattern: /\b(ftk|otk)\b/i },
  { strategy: "Burn", pattern: /\bburn\b/i },
  { strategy: "Mill", pattern: /\bmill\b/i },
  { strategy: "Stall", pattern: /\b(stall|stun|lockdown|lock)\b/i },
  { strategy: "Control", pattern: /\bcontrol\b/i },
  { strategy: "Aggro", pattern: /\b(aggro|beatdown|beats?)\b/i },
  { strategy: "Midrange", pattern: /\bmidrange\b/i },
  { strategy: "Combo", pattern: /\bcombo\b/i },
];

export const STRATEGIES = STRATEGY_RULES.map((r) => r.strategy);

export function detectStrategy(deckName: string): string | null {
  for (const { strategy, pattern } of STRATEGY_RULES) {
    if (pattern.test(deckName)) return strategy;
  }
  return null;
}
