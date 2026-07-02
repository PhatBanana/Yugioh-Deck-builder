import type { YgoCardInfoResponse, YgoDbVersion } from "./types";

const BASE_URL = "https://db.ygoprodeck.com/api/v7";
const USER_AGENT =
  "ygoh-deck-recommender/1.0 (local hobby project; personal use)";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`YGOPRODeck request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as T;
}

export async function fetchDbVersion(): Promise<YgoDbVersion> {
  const data = await get<YgoDbVersion[]>(`${BASE_URL}/checkDBVer.php`);
  const [version] = data;
  if (!version) throw new Error("checkDBVer.php returned no data");
  return version;
}

export async function fetchAllCards(): Promise<YgoCardInfoResponse> {
  return get<YgoCardInfoResponse>(`${BASE_URL}/cardinfo.php`);
}
