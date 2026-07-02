"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import CardGrid from "../../components/CardGrid";
import CardFilters, {
  type CardFiltersState,
  type FilterValues,
} from "../../components/CardFilters";
import type { CardWithOwnership } from "../../components/CardTile";
import CollectionStats from "../../components/CollectionStats";
import SyncStatusBanner from "../../components/SyncStatusBanner";

const PAGE_SIZE = 48;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CardsResponse {
  cards: CardWithOwnership[];
  total: number;
}

function filtersFromParams(params: URLSearchParams): CardFiltersState {
  return {
    q: params.get("q") ?? "",
    type: params.get("type") ?? "",
    race: params.get("race") ?? "",
    attribute: params.get("attribute") ?? "",
    archetype: params.get("archetype") ?? "",
    ownedOnly: params.get("ownedOnly") === "true",
    sort: params.get("sort") ?? "name",
  };
}

function CardsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<CardFiltersState>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString()))
  );
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [debouncedQ, setDebouncedQ] = useState(filters.q);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // Mirror state into the URL so filters survive reloads and back/forward.
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (filters.type) params.set("type", filters.type);
    if (filters.race) params.set("race", filters.race);
    if (filters.attribute) params.set("attribute", filters.attribute);
    if (filters.archetype) params.set("archetype", filters.archetype);
    if (filters.ownedOnly) params.set("ownedOnly", "true");
    if (filters.sort !== "name") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `/cards?${qs}` : "/cards", { scroll: false });
  }, [debouncedQ, filters, page, router]);

  function handleFiltersChange(next: CardFiltersState) {
    setFilters(next);
    setPage(1);
  }

  const { data: filterOptions } = useSWR<FilterValues>("/api/cards/filters", fetcher);

  const apiParams = new URLSearchParams();
  if (debouncedQ) apiParams.set("q", debouncedQ);
  if (filters.type) apiParams.set("type", filters.type);
  if (filters.race) apiParams.set("race", filters.race);
  if (filters.attribute) apiParams.set("attribute", filters.attribute);
  if (filters.archetype) apiParams.set("archetype", filters.archetype);
  if (filters.ownedOnly) apiParams.set("ownedOnly", "true");
  if (filters.sort) apiParams.set("sort", filters.sort);
  apiParams.set("page", String(page));
  apiParams.set("pageSize", String(PAGE_SIZE));

  const { data, isLoading } = useSWR<CardsResponse>(`/api/cards?${apiParams.toString()}`, fetcher);

  const cards = data?.cards ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">Card Browser</h1>
        <CollectionStats />
      </div>
      <SyncStatusBanner />
      <CardFilters values={filters} onChange={handleFiltersChange} filterOptions={filterOptions ?? null} />
      <div className="text-sm text-neutral-400 mb-3">
        {isLoading ? "Loading..." : `${total.toLocaleString()} cards`}
      </div>
      <CardGrid cards={cards} />
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 text-sm">
          <button
            className="px-3 py-1.5 rounded bg-neutral-800 disabled:opacity-30"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="px-3 py-1.5 rounded bg-neutral-800 disabled:opacity-30"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function CardsPage() {
  return (
    <Suspense>
      <CardsPageInner />
    </Suspense>
  );
}
