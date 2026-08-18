import { useLiveQuery } from "dexie-react-hooks";
import type { ScannedEntry } from "../hooks/useAutoScan";
import { db } from "../db";
import { foilClass } from "../lib/foil";
import { formatUsd } from "../lib/util";
import { rarityAbbrev } from "@shared/scan/setCode";
import BottomSheet from "./BottomSheet";

// Mid-scan review of everything added this session: every card with its
// filed printing, tappable rarity fix (not just for flagged guesses — the
// confident guess can be wrong too), and per-card remove. Exists so a
// misread during bulk scanning is a two-tap fix now instead of a hunt
// through the collection later.
export default function SessionReviewSheet({
  session,
  onClose,
  onRemove,
  onPickRarity,
}: {
  session: ScannedEntry[];
  onClose: () => void;
  onRemove: (entry: ScannedEntry) => void;
  onPickRarity: (entry: ScannedEntry) => void;
}) {
  const total = session.reduce((n, e) => n + e.count, 0);

  // Approximate session value from the local card prices (generic card
  // price — printing-level pricing would need per-row set lookups).
  const value = useLiveQuery(
    async () => {
      const cards = await db.cards.bulkGet(session.map((e) => e.id));
      return session.reduce((sum, e, i) => sum + (cards[i]?.price ?? 0) * e.count, 0);
    },
    [session],
    0
  );

  return (
    <BottomSheet
      onClose={onClose}
      title="This session"
      panelClass="max-h-[80vh] overflow-y-auto"
    >
      <p className="text-xs text-neutral-500 mb-3 tabular-nums">
        {total} card{total === 1 ? "" : "s"} added · ≈ {formatUsd(value)}
      </p>

      <div className="flex flex-col divide-y divide-line">
        {session.map((e) => {
          const foil = foilClass(e.rarity);
          const unsure = e.ambiguous || e.agreement === "conflict" || e.agreement === "unknown";
          const canPick = (e.candidates?.length ?? 0) > 1;
          return (
            <div key={e.id} className="flex items-center gap-3 py-2">
              <span className="relative block w-10 shrink-0">
                {e.img ? (
                  <>
                    <img src={e.img} alt="" className="w-10 rounded" />
                    {foil && <span aria-hidden className={`foil ${foil}`} />}
                  </>
                ) : (
                  <span className="block w-10 h-[58px] rounded bg-raised" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-100 truncate">{e.name}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {[e.code, e.edition].filter(Boolean).join(" · ") || "printing unknown"}
                </div>
                {e.rarity &&
                  (canPick ? (
                    <button
                      type="button"
                      onClick={() => onPickRarity(e)}
                      className={`text-[11px] font-semibold underline decoration-dotted underline-offset-2 ${
                        e.agreement === "conflict"
                          ? "text-rose-400"
                          : unsure
                            ? "text-amber-300"
                            : "text-amber-300/90"
                      }`}
                    >
                      {rarityAbbrev(e.rarity)}
                      {unsure ? "? — tap to fix" : " — tap to change"}
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-300/90">
                      {rarityAbbrev(e.rarity)}
                    </span>
                  ))}
              </div>
              {e.count > 1 && (
                <span className="text-xs text-neutral-400 tabular-nums shrink-0">×{e.count}</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(e)}
                className="shrink-0 w-8 h-8 rounded-full bg-raised text-neutral-300 text-lg leading-none pressable"
                aria-label={`Remove one ${e.name}`}
              >
                −
              </button>
            </div>
          );
        })}
      </div>

      {session.length === 0 && <p className="empty-state">Nothing added yet this session.</p>}
    </BottomSheet>
  );
}
