import { useLiveQuery } from "dexie-react-hooks";
import { getCollectionInsights } from "../services/insights";
import type { ValueGroup } from "@shared/collection/insights";
import { formatUsd } from "../lib/util";
import { useBackClose } from "../hooks/useBackClose";
import { useCardDetail } from "./CardDetailModal";
import CardThumb from "./CardThumb";

// A horizontal bar list — each row's bar is scaled to the largest value, so the
// distribution reads at a glance (value by type, by archetype).
function BarList({ groups, max }: { groups: ValueGroup[]; max: number }) {
  if (groups.length === 0) return <p className="text-xs text-neutral-600">Not enough data yet.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => (
        <div key={g.key} className="text-xs">
          <div className="flex items-center justify-between mb-0.5">
            <span className="truncate text-neutral-300">{g.key}</span>
            <span className="tabular-nums text-neutral-400 shrink-0 ml-2">
              {formatUsd(g.value)}
              <span className="text-neutral-600"> · {g.count}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-overlay overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500"
              style={{ width: `${max > 0 ? Math.max(3, (g.value / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsightsSheet({ onClose }: { onClose: () => void }) {
  useBackClose(onClose);
  const openCard = useCardDetail();
  const insights = useLiveQuery(() => getCollectionInsights(), []);

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">📊 Collection insights</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        {!insights ? (
          <p className="text-sm text-neutral-500 py-6 text-center">Crunching your collection…</p>
        ) : insights.totalCopies === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">
            Add some cards to see where your collection's value sits.
          </p>
        ) : (
          <>
            {/* Headline numbers. */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center tabular-nums">
              <div className="panel py-2">
                <div className="text-lg font-semibold text-amber-300">{formatUsd(insights.totalValue)}</div>
                <div className="text-[10px] text-neutral-500">total value</div>
              </div>
              <div className="panel py-2">
                <div className="text-lg font-semibold">{insights.totalCopies}</div>
                <div className="text-[10px] text-neutral-500">copies</div>
              </div>
              <div className="panel py-2">
                <div className="text-lg font-semibold">{formatUsd(insights.avgCardValue)}</div>
                <div className="text-[10px] text-neutral-500">avg / card</div>
              </div>
            </div>

            {/* Most valuable cards. */}
            <h3 className="text-xs font-semibold text-neutral-400 mb-1.5">Most valuable</h3>
            <div className="divide-y divide-line/70 mb-4">
              {insights.topCards.map((c) => (
                <button
                  key={c.cardId}
                  type="button"
                  onClick={() => openCard(c.cardId)}
                  className="flex items-center gap-2.5 w-full text-left py-1.5"
                >
                  <CardThumb img={c.img} w="w-7" h="h-10" />
                  <span className="min-w-0 flex-1 text-sm truncate">{c.name}</span>
                  {c.quantity > 1 && (
                    <span className="text-[11px] text-neutral-500 tabular-nums">×{c.quantity}</span>
                  )}
                  <span className="text-sm text-amber-300 tabular-nums shrink-0">{formatUsd(c.value)}</span>
                </button>
              ))}
            </div>

            {/* Value split by card type. */}
            <h3 className="text-xs font-semibold text-neutral-400 mb-1.5">Value by type</h3>
            <div className="mb-4">
              <BarList groups={insights.byType} max={insights.byType[0]?.value ?? 0} />
            </div>

            {/* Value split by archetype (top ones). */}
            <h3 className="text-xs font-semibold text-neutral-400 mb-1.5">Top archetypes</h3>
            <BarList groups={insights.byArchetype.slice(0, 8)} max={insights.byArchetype[0]?.value ?? 0} />
          </>
        )}
      </div>
    </div>
  );
}
