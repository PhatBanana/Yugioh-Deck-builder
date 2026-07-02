"use client";

import useSWR from "swr";

interface Stats {
  uniqueCards: number;
  totalCopies: number;
  estimatedValueUsd: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CollectionStats() {
  const { data } = useSWR<Stats>("/api/collection/stats", fetcher, {
    refreshInterval: 30_000,
  });

  if (!data) return null;

  return (
    <div className="flex items-center gap-3 text-sm text-neutral-400">
      <span className="tabular-nums">
        {data.totalCopies.toLocaleString()} cards ({data.uniqueCards.toLocaleString()} unique)
        {data.estimatedValueUsd > 0 && (
          <span className="text-amber-400/80"> · ≈ ${data.estimatedValueUsd.toFixed(2)}</span>
        )}
      </span>
      <a
        href="/api/collection/export"
        download
        className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200"
        title="Download a JSON backup of your collection"
      >
        Export backup
      </a>
    </div>
  );
}
