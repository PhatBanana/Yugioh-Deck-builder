import { Capacitor, CapacitorHttp } from "@capacitor/core";

// On Android, CapacitorHttp does the request natively — no CORS restrictions,
// which the meta-deck page scrape needs. In the browser (dev) plain fetch is
// used; the YGOPRODeck API allows cross-origin reads, page scrapes won't.
export async function httpGetText(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, responseType: "text", readTimeout: 30000 });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function httpGetJson<T>(url: string): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, readTimeout: 120000 });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
    return (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as T;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}
