import { Capacitor } from "@capacitor/core";
import { db } from "../db";
import { buildDiagnosticsReport } from "../lib/diagnostics";
import { installedBuild } from "./appUpdate";
import { jpPrintingsCount } from "./jpPrintings";
import { installedLangs } from "./langPacks";

// Assembles the diagnostics report: the logs, plus the environment needed to
// read them — which build, which scan settings, which packs, how much data.
// Every probe is individually guarded: a report is most wanted exactly when
// something is broken, so one failing lookup must not sink the rest.
export async function diagnosticsReport(): Promise<string> {
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const [build, cards, owned, decks, wishlist, langs, jp, lastSync] = await Promise.all([
    safe(installedBuild, null),
    safe(() => db.cards.count(), -1),
    safe(() => db.collection.count(), -1),
    safe(() => db.decks.count(), -1),
    safe(() => db.wishlist.count(), -1),
    safe(installedLangs, new Set<string>()),
    safe(jpPrintingsCount, -1),
    safe(async () => (await db.syncMeta.get("cards_last_synced_at"))?.value ?? null, null),
  ]);
  let scanSettings = "—";
  try {
    scanSettings = localStorage.getItem("ygo-scan-settings") ?? "defaults";
  } catch {
    // ignore
  }
  return buildDiagnosticsReport({
    build: build ?? "browser",
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent,
    "card database": cards,
    "last card sync": lastSync,
    "collection entries": owned,
    decks,
    wishlist,
    "language packs": [...langs].sort().join(", ") || "none",
    "japanese printings": jp,
    "scan settings": scanSettings,
  });
}
