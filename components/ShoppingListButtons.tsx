"use client";

import type { MissingCard } from "../lib/recommendation/types";
import { toast } from "./Toaster";

// "3 Card Name" lines — the format TCGPlayer's Mass Entry accepts.
function toMassEntryText(cards: MissingCard[]): string {
  return cards.map((c) => `${c.missingQuantity} ${c.cardName}`).join("\n");
}

function toCsv(cards: MissingCard[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = cards.map((c) =>
    [
      escape(c.cardName),
      c.missingQuantity,
      c.section,
      c.isKeyCard ? "key" : "",
      c.priceUsd != null ? c.priceUsd.toFixed(2) : "",
      c.missingCostUsd != null ? c.missingCostUsd.toFixed(2) : "",
    ].join(",")
  );
  return ["Card,Missing,Section,Key,Unit Price USD,Total USD", ...rows].join("\n");
}

export default function ShoppingListButtons({
  cards,
  deckName,
}: {
  cards: MissingCard[];
  deckName: string;
}) {
  if (cards.length === 0) return null;

  async function copyList() {
    try {
      await navigator.clipboard.writeText(toMassEntryText(cards));
      toast(`Copied ${cards.length} missing cards to clipboard.`, "success");
    } catch {
      toast("Couldn't access the clipboard.", "error");
    }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(cards)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deckName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-missing-cards.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copyList}
        className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
        title="Copy as TCGPlayer Mass Entry format"
      >
        Copy list
      </button>
      <button
        type="button"
        onClick={downloadCsv}
        className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
      >
        Download CSV
      </button>
    </div>
  );
}
