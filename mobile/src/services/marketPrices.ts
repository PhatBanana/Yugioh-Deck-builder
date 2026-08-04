import { parseMarketTrend, type MarketSeries } from "@shared/prices/marketTrend";
import { httpGetJson } from "./http";

// Real market price history from YGOPRODeck's price-trend endpoints (the same
// data its website's card price graph uses). Per printing, going back months —
// far more than the app's own locally-recorded points. Undocumented and
// best-effort: many cards have no trend data and return an empty list.

export type PriceStore = "tcgplayer" | "cardmarket";

const ENDPOINT: Record<PriceStore, string> = {
  tcgplayer: "https://ygoprodeck.com/api/card/trendPrices.php",
  cardmarket: "https://ygoprodeck.com/api/card/trendPricesCardmarket.php",
};

export const STORE_SYMBOL: Record<PriceStore, string> = { tcgplayer: "$", cardmarket: "€" };

// Distinguishes "the card has no trend data" (a real, cacheable answer) from
// "the request failed" (offline/blocked — worth a retry, not a 'no data'
// message that reads as permanent).
export type MarketHistoryResult =
  | { ok: true; series: MarketSeries[] }
  | { ok: false };

// In-memory cache so flipping between printings/stores or reopening a card in
// the same session doesn't refetch. Only successful answers are cached.
const cache = new Map<string, MarketSeries[]>();

export async function getMarketPriceHistory(
  cardName: string,
  store: PriceStore = "tcgplayer"
): Promise<MarketHistoryResult> {
  const key = `${store}|${cardName}`;
  const cached = cache.get(key);
  if (cached) return { ok: true, series: cached };
  try {
    const json = await httpGetJson<unknown>(
      `${ENDPOINT[store]}?name=${encodeURIComponent(cardName)}`
    );
    const series = parseMarketTrend(json);
    cache.set(key, series);
    return { ok: true, series };
  } catch {
    return { ok: false };
  }
}
