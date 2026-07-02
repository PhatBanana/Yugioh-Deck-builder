import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <h1 className="text-3xl font-semibold">Yu-Gi-Oh! Deck Recommender</h1>
      <p className="text-neutral-400 max-w-md">
        Track which cards you own, then see the top 5 meta decks you&apos;re closest
        to building — and exactly what&apos;s missing.
      </p>
      <div className="flex gap-4">
        <Link
          href="/cards"
          className="px-4 py-2 rounded bg-neutral-100 text-neutral-900 font-medium hover:bg-white"
        >
          Browse Cards
        </Link>
        <Link
          href="/recommendations"
          className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
        >
          View Recommendations
        </Link>
      </div>
    </div>
  );
}
