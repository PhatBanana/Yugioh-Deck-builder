import { addOwned, addPrintingCopy } from "../services/collection";
import { clearRecentAdds, takeAdd, useRecentAdds, type RecentAdd } from "../lib/recentAdds";
import { useCardDetail } from "./CardDetailModal";
import { toast } from "./Toaster";

// The Add tab's "Recently added" list: the last few things any add path put
// in the collection (scan, name search, pasted list, deck), each with an
// undo — for the card a scan misread, noticed after the camera closed.

const SHOWN = 10;

const SOURCE_LABEL: Record<RecentAdd["source"], string> = {
  scan: "scanned",
  search: "searched",
  paste: "pasted list",
  deck: "from a deck",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

async function undo(e: RecentAdd) {
  if (!takeAdd(e.id)) return; // already taken back from the scan session
  // The exact printing row first — dropping the total alone would trim
  // whichever row the reconcile picks.
  if (e.printing) await addPrintingCopy(e.cardId, e.printing, -e.delta);
  await addOwned(e.cardId, -e.delta);
  toast(`Removed ${e.delta > 1 ? `${e.delta}× ` : ""}${e.name}`, "info");
}

export default function RecentAdds() {
  const adds = useRecentAdds();
  const openCard = useCardDetail();
  if (adds.length === 0) return null;
  return (
    <section className="mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Recently added
        </h3>
        <button type="button" onClick={clearRecentAdds} className="text-xs text-neutral-500 px-1">
          Clear
        </button>
      </div>
      <div className="panel divide-y divide-line/70">
        {adds.slice(0, SHOWN).map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => openCard(e.cardId)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-sm truncate">
                {e.delta > 1 && <span className="text-amber-300 tabular-nums">{e.delta}× </span>}
                {e.name}
              </span>
              <span className="block text-[11px] text-neutral-500">
                {SOURCE_LABEL[e.source]}
                {e.printing?.rarity ? ` · ${e.printing.rarity}` : ""} · {ago(e.at)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void undo(e)}
              aria-label={`Undo adding ${e.name}`}
              className="btn-ghost text-xs px-2.5 py-1.5 shrink-0"
            >
              ↶ Undo
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
