"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import DeckRecommendationCard from "../../components/DeckRecommendationCard";
import SyncStatusBanner from "../../components/SyncStatusBanner";
import type { DeckRecommendation } from "../../lib/recommendation/types";

interface RecommendationsResponse {
  recommendations: DeckRecommendation[];
  generatedAt: string;
  metaDecksSource: string | null;
  metaDecksLastSyncedAt: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function RecommendationsPage() {
  const [includeSide, setIncludeSide] = useState(false);
  const { data, isLoading } = useSWR<RecommendationsResponse>(
    `/api/recommendations?includeSide=${includeSide}`,
    fetcher
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Top Meta Deck Recommendations</h1>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-neutral-400">
          Based on the cards you&apos;ve marked as owned, ranked by how close you are to
          completing each build.
        </p>
        <label className="flex items-center gap-1.5 text-sm text-neutral-300 shrink-0">
          <input
            type="checkbox"
            checked={includeSide}
            onChange={(e) => setIncludeSide(e.target.checked)}
          />
          Include side deck
        </label>
      </div>
      <SyncStatusBanner />

      {isLoading && <div className="text-neutral-400">Loading recommendations...</div>}

      {!isLoading && data && data.recommendations.length === 0 && (
        <div className="text-neutral-400">
          No meta decks available yet.{" "}
          <Link href="/cards" className="underline hover:text-white">
            Browse cards
          </Link>{" "}
          and mark a few as owned to get recommendations.
        </div>
      )}

      {!isLoading && data && data.recommendations.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.recommendations.map((rec, i) => (
            <DeckRecommendationCard key={rec.deckId} recommendation={rec} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
