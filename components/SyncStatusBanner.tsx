"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  cards: { count: number; lastSyncedAt: string | null; databaseVersion: string | null };
  metaDecks: { count: number; lastSyncedAt: string | null; source: string | null };
}

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

export default function SyncStatusBanner() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [syncing, setSyncing] = useState<"cards" | "decks" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshStatus() {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function runSync(kind: "cards" | "decks") {
    setSyncing(kind);
    setError(null);
    try {
      const url = kind === "cards" ? "/api/cards/sync" : "/api/meta-decks/sync";
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      }
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  if (!status) return null;

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-xs text-neutral-400 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span>
        Cards: {status.cards.count.toLocaleString()} synced{" "}
        <span className="text-neutral-500">({formatTime(status.cards.lastSyncedAt)})</span>
      </span>
      <span>
        Meta decks: {status.metaDecks.count}{" "}
        <span className="text-neutral-500">
          ({status.metaDecks.source ?? "unseeded"} · {formatTime(status.metaDecks.lastSyncedAt)})
        </span>
      </span>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={syncing !== null}
          onClick={() => runSync("cards")}
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
        >
          {syncing === "cards" ? "Syncing cards..." : "Sync cards"}
        </button>
        <button
          type="button"
          disabled={syncing !== null}
          onClick={() => runSync("decks")}
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
        >
          {syncing === "decks" ? "Syncing decks..." : "Sync meta decks"}
        </button>
      </div>
      {error && <div className="w-full text-red-400">{error}</div>}
    </div>
  );
}
