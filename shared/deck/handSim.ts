// Opening-hand simulator: expand a deck list into a pile of card ids (one per
// copy) and draw without replacement.

export function buildPile(cards: { cardId: number; quantity: number }[]): number[] {
  const pile: number[] = [];
  for (const c of cards) {
    for (let i = 0; i < c.quantity; i++) pile.push(c.cardId);
  }
  return pile;
}

// Draws `n` cards from the pile without replacement (partial Fisher–Yates).
// `rand` is injectable for deterministic tests.
export function drawHand(pile: number[], n: number, rand: () => number = Math.random): number[] {
  const deck = [...pile];
  const count = Math.min(n, deck.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, count);
}
