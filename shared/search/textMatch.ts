// Case- and word-order-insensitive text matching for deck/archetype search:
// "branded despia" matches "Despia Branded", "BRANDED-Despia", etc.

export function queryTokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// True when every word of the query appears somewhere in the text, regardless
// of case or word order. An empty query matches everything.
export function matchesQuery(text: string, query: string | string[]): boolean {
  const tokens = Array.isArray(query) ? query : queryTokens(query);
  if (tokens.length === 0) return true;
  const hay = text.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}
