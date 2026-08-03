// Opening-hand probability math for a deck, using the hypergeometric
// distribution (drawing without replacement). Pure and framework-free so it
// can be unit-tested; the UI feeds it a main-deck size and copy counts.
//
// All functions return a probability in [0, 1]. Deck/hand sizes are small
// (≤60 cards, ≤~6 drawn), so plain-double binomials stay exact and cheap.

// Binomial coefficient C(n, k) via the multiplicative formula (no factorials,
// so nothing overflows for the sizes we use). Returns 0 for out-of-range k.
export function combination(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return 0;
  k = Math.min(k, n - k); // symmetry keeps the loop short
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

// P(exactly `k` successes) when drawing `draw` cards from a `deck`-sized pile
// containing `successes` copies of the thing you care about.
export function hypergeometricPmf(
  deck: number,
  successes: number,
  draw: number,
  k: number
): number {
  const denom = combination(deck, draw);
  if (denom === 0) return 0;
  return (
    (combination(successes, k) * combination(deck - successes, draw - k)) / denom
  );
}

// P(drawing zero of the `successes` copies in a `draw`-card hand) — i.e. every
// drawn card comes from the non-success remainder.
export function chanceOfNone(deck: number, successes: number, draw: number): number {
  const denom = combination(deck, draw);
  if (denom === 0) return 1;
  return combination(deck - successes, draw) / denom;
}

// P(at least `need` copies of a card in the opening hand). `need` defaults to
// 1 ("do I see it at all?").
export function chanceToDraw(
  deck: number,
  copies: number,
  handSize: number,
  need = 1
): number {
  if (need <= 0) return 1;
  if (copies < need || handSize < need) return 0;
  const maxK = Math.min(copies, handSize);
  let p = 0;
  for (let k = need; k <= maxK; k++) {
    p += hypergeometricPmf(deck, copies, handSize, k);
  }
  return clamp01(p);
}

// P(opening at least one card from a group), given the group's *total* copy
// count. Because "a starter" means any card in the group, the group behaves as
// a single success pool of size `groupCopies`, so this is exact (not an
// independence approximation).
export function chanceToOpenAny(
  deck: number,
  groupCopies: number,
  handSize: number
): number {
  if (groupCopies <= 0) return 0;
  return clamp01(1 - chanceOfNone(deck, groupCopies, handSize));
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
