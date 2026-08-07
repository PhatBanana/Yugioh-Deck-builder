import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getPriceAlerts } from "../services/priceAlerts";
import { formatUsd } from "../lib/util";
import { useBackClose } from "../hooks/useBackClose";
import { useCardDetail } from "./CardDetailModal";
import CardThumb from "./CardThumb";

const WINDOWS = [
  { days: 7, label: "1w" },
  { days: 30, label: "1m" },
  { days: 90, label: "3m" },
];

export default function PriceAlertsSheet({ onClose }: { onClose: () => void }) {
  useBackClose(onClose);
  const openCard = useCardDetail();
  const [windowDays, setWindowDays] = useState(30);
  const result = useLiveQuery(() => getPriceAlerts(windowDays), [windowDays]);

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">🔔 Price alerts</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Notable moves (≥15% and ≥$0.50) on your owned & wishlisted cards.
        </p>

        <div className="seg text-xs mb-3">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setWindowDays(w.days)}
              className={`seg-btn py-1.5 ${windowDays === w.days ? "seg-on" : ""}`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {!result ? (
          <p className="empty-state">Checking prices…</p>
        ) : result.alerts.length === 0 ? (
          <p className="empty-state">
            No notable moves in this window. Prices update when you re-sync the card
            database.
          </p>
        ) : (
          <div className="divide-y divide-line/70">
            {result.alerts.map((a) => {
              const up = a.absChange >= 0;
              return (
                <button
                  key={a.cardId}
                  type="button"
                  onClick={() => openCard(a.cardId)}
                  className="flex items-center gap-2.5 w-full text-left py-1.5"
                >
                  <CardThumb img={a.img} w="w-7" h="h-10" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{a.name}</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">
                      {formatUsd(a.baseline)} → {formatUsd(a.latest)}
                      <span className="ml-1.5 text-neutral-600">
                        {a.owned ? "owned" : "wishlist"}
                      </span>
                      {a.sinceStart && (
                        <span className="ml-1.5 text-neutral-600">
                          since {a.baselineDate.slice(5)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`text-right tabular-nums shrink-0 ${up ? "text-emerald-400" : "text-red-400"}`}>
                    <div className="text-sm font-medium">
                      {up ? "▲" : "▼"} {Math.abs(a.pctChange * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px]">
                      {up ? "+" : "−"}{formatUsd(Math.abs(a.absChange))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
