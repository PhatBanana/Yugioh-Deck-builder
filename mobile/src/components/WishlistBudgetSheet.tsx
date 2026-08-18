import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { planBudget } from "@shared/collection/budget";
import { getWishlistItems } from "../services/wishlist";
import { formatUsd } from "../lib/util";
import { useCardDetail } from "./CardDetailModal";
import CardThumb from "./CardThumb";
import BottomSheet from "./BottomSheet";

// "What can I complete for $X?" — totals the wishlist and, for a budget, picks
// the cheapest cards that fit (most wants knocked out per dollar).
// Rows rendered before "Show more" takes over — a big wishlist shouldn't
// mount hundreds of rows in one go.
const PAGE = 60;

export default function WishlistBudgetSheet({ onClose }: { onClose: () => void }) {
  const openCard = useCardDetail();
  const items = useLiveQuery(() => getWishlistItems(), [], []);
  const [budget, setBudget] = useState(25);
  const [limit, setLimit] = useState(PAGE);

  const plan = useMemo(
    () => planBudget(items.map((i) => ({ id: i.cardId, price: i.price })), budget),
    [items, budget]
  );
  const affordable = useMemo(() => new Set(plan.affordableIds), [plan]);
  // Priced cards, cheapest first, so the "fits / doesn't" split reads in order.
  const sorted = useMemo(
    () => items.filter((i) => i.price > 0).sort((a, b) => a.price - b.price),
    [items]
  );

  return (
    <BottomSheet onClose={onClose} title="💰 Budget planner">
      {items.length === 0 ? (
        <p className="empty-state">
          Your wishlist is empty — tap ♡ on cards to plan around them.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500 mb-3">
            Whole wishlist ≈{" "}
            <span className="text-amber-300">{formatUsd(plan.total)}</span>
            {plan.unpricedCount > 0 && (
              <span className="text-neutral-600"> · {plan.unpricedCount} unpriced</span>
            )}
          </p>

          {/* Budget input + slider. */}
          <label className="block text-xs text-neutral-400 mb-1">Budget</label>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-300">$</span>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
              className="input-base w-24 rounded-lg px-3 py-1.5 text-sm tabular-nums"
            />
            <input
              type="range"
              min={0}
              max={Math.max(10, Math.ceil(plan.total))}
              value={Math.min(budget, Math.max(10, Math.ceil(plan.total)))}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
          </div>

          {/* Outcome. */}
          <div className="panel p-3 mb-3 flex items-center justify-around text-center tabular-nums">
            <div>
              <div className="text-2xl font-semibold text-emerald-400">
                {plan.affordableIds.length}
              </div>
              <div className="text-[11px] text-neutral-500">of {sorted.length} cards</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-amber-300">{formatUsd(plan.spent)}</div>
              <div className="text-[11px] text-neutral-500">spent</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-300">{formatUsd(plan.remaining)}</div>
              <div className="text-[11px] text-neutral-500">left over</div>
            </div>
          </div>

          {/* Cheapest-first list, split by what fits. */}
          <div className="divide-y divide-line/70">
            {sorted.slice(0, limit).map((c) => {
              const fits = affordable.has(c.cardId);
              return (
                <button
                  key={c.cardId}
                  type="button"
                  onClick={() => openCard(c.cardId)}
                  className={`flex items-center gap-2.5 w-full text-left py-1.5 ${fits ? "" : "opacity-45"}`}
                >
                  <span className={`shrink-0 text-sm ${fits ? "text-emerald-400" : "text-neutral-600"}`}>
                    {fits ? "✓" : "○"}
                  </span>
                  <CardThumb img={c.img} w="w-7" h="h-10" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{c.name}</div>
                    {c.owned > 0 && (
                      <div className="text-[11px] text-neutral-500">own {c.owned}</div>
                    )}
                  </div>
                  <span className="text-sm text-amber-300 tabular-nums shrink-0">{formatUsd(c.price)}</span>
                </button>
              );
            })}
          </div>
          {sorted.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="btn-ghost w-full py-2 text-sm mt-2"
            >
              Show more ({sorted.length - limit} left)
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}
