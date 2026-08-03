import { useEffect, useState } from "react";
import { getSetCompletion, type SetCompletion } from "../services/sets";
import { formatUsd } from "../lib/util";
import { useBackClose } from "../hooks/useBackClose";
import CardThumb from "./CardThumb";
import WishlistButton from "./WishlistButton";
import { useCardDetail } from "./CardDetailModal";

// Completion view for one card set: progress bar, what you own, what's
// missing (with wishlist hearts).
export default function SetSheet({ setName, onClose }: { setName: string; onClose: () => void }) {
  const [completion, setCompletion] = useState<SetCompletion | null | undefined>(undefined);
  const openCard = useCardDetail();
  useBackClose(onClose);

  useEffect(() => {
    let cancelled = false;
    getSetCompletion(setName).then((c) => !cancelled && setCompletion(c));
    return () => {
      cancelled = true;
    };
  }, [setName]);

  const total = completion ? completion.ownedCards.length + completion.missingCards.length : 0;
  const pct = completion && total > 0 ? Math.round((completion.ownedCards.length / total) * 100) : 0;

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-lg font-semibold leading-tight">{setName}</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        {completion === undefined && <p className="text-sm text-neutral-500 py-6">Loading set…</p>}
        {completion === null && (
          <p className="text-sm text-neutral-400 py-6">
            Couldn't load this set's card list — check your connection and try again.
          </p>
        )}

        {completion && (
          <>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="tabular-nums">
                You own <b>{completion.ownedCards.length}</b> of <b>{total}</b> cards
              </span>
              <span className="text-amber-300 font-semibold tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {completion.unresolvedCount > 0 && (
              <p className="text-[11px] text-neutral-600 mt-1">
                {completion.unresolvedCount} card(s) in this set aren't in the local database.
              </p>
            )}

            {completion.missingCards.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-orange-400 mb-1 flex items-center justify-between">
                  <span>Missing ({completion.missingCards.length})</span>
                  {(() => {
                    const cost = completion.missingCards.reduce((s, c) => s + (c.price ?? 0), 0);
                    return cost > 0 ? (
                      <span className="tabular-nums font-normal text-neutral-400">
                        ≈ {formatUsd(cost)} to complete
                      </span>
                    ) : null;
                  })()}
                </h3>
                <div className="flex flex-col">
                  {completion.missingCards.map((c) => (
                    <div key={c.cardId} className="flex items-center gap-2 py-1">
                      <button
                        type="button"
                        onClick={() => openCard(c.cardId)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <CardThumb img={c.img} w="w-7" h="h-10" />
                        <span className="text-sm truncate">{c.name}</span>
                      </button>
                      <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                        {c.price != null ? formatUsd(c.price) : ""}
                      </span>
                      <WishlistButton cardId={c.cardId} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completion.ownedCards.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-emerald-400 mb-1">
                  You own ({completion.ownedCards.length})
                </h3>
                <div className="flex flex-col">
                  {completion.ownedCards.map((c) => (
                    <button
                      key={c.cardId}
                      type="button"
                      onClick={() => openCard(c.cardId)}
                      className="flex items-center gap-2 py-1 text-left"
                    >
                      <CardThumb img={c.img} w="w-7" h="h-10" />
                      <span className="text-sm truncate flex-1">{c.name}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">×{c.owned}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
