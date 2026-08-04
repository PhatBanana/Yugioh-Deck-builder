import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketSeries } from "@shared/prices/marketTrend";
import { getMarketPriceHistory, STORE_SYMBOL, type PriceStore } from "../services/marketPrices";
import PriceSparkline from "./PriceSparkline";

const W = 300;
const H = 48;
const PAD = 4;

const STORES: { id: PriceStore; label: string }[] = [
  { id: "tcgplayer", label: "TCGplayer" },
  { id: "cardmarket", label: "Cardmarket" },
];

// Card price history. Prefers YGOPRODeck's real market trend data (per
// printing, months of history); falls back to the app's own recorded points
// when a card has no trend data.
export default function PriceHistory({ cardId, cardName }: { cardId: number; cardName: string }) {
  const [store, setStore] = useState<PriceStore>("tcgplayer");
  // null = loading; "failed" = request failed (offline) — distinct from a
  // successful "this card has no trend data" answer.
  const [series, setSeries] = useState<MarketSeries[] | "failed" | null>(null);
  const [seriesIdx, setSeriesIdx] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSeries(null);
    setSeriesIdx(0);
    getMarketPriceHistory(cardName, store).then(
      (r) => !cancelled && setSeries(r.ok ? r.series : "failed")
    );
    return () => {
      cancelled = true;
    };
  }, [cardName, store, attempt]);

  const chosen = Array.isArray(series) ? series[seriesIdx] : undefined;

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-400">Price history</span>
        <div className="seg text-[11px]">
          {STORES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStore(s.id)}
              className={`seg-btn px-2 py-0.5 ${store === s.id ? "seg-on" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {series === null && <p className="text-xs text-neutral-600">Loading market history…</p>}

      {series === "failed" && (
        <>
          <p className="text-xs text-neutral-600 mb-1">
            Couldn't load market history — check your connection.{" "}
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="text-amber-400 underline"
            >
              Retry
            </button>
          </p>
          {/* Whatever the app recorded locally still works offline. */}
          <PriceSparkline cardId={cardId} />
        </>
      )}

      {Array.isArray(series) && series.length === 0 && (
        <>
          <p className="text-xs text-neutral-600 mb-1">
            No {STORES.find((s) => s.id === store)?.label} trend data for this card.
          </p>
          {/* Fall back to whatever the app has recorded locally. */}
          <PriceSparkline cardId={cardId} />
        </>
      )}

      {chosen && (
        <>
          {Array.isArray(series) && series.length > 1 && (
            <select
              className="input-base w-full rounded-lg px-2 py-1.5 text-xs mb-2"
              value={seriesIdx}
              onChange={(e) => setSeriesIdx(Number(e.target.value))}
            >
              {series.map((s, i) => (
                <option key={i} value={i}>
                  {s.printing}
                </option>
              ))}
            </select>
          )}
          <MarketChart series={chosen} symbol={STORE_SYMBOL[store]} />
        </>
      )}
    </div>
  );
}

function MarketChart({ series, symbol }: { series: MarketSeries; symbol: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const money = (v: number) => `${symbol}${v.toFixed(2)}`;

  const geom = useMemo(() => {
    const points = series.points;
    const values = points.map((p) => p.priceUsd);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const xAt = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
    const yAt = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.priceUsd).toFixed(1)}`)
      .join(" ");
    return { points, min, max, xAt, path };
  }, [series]);

  const { points, min, max, xAt, path } = geom;
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.priceUsd - first.priceUsd;
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-neutral-500">
          {hovered
            ? `${hovered.date} · ${money(hovered.priceUsd)}`
            : `${points.length} points · since ${first.date}`}
        </span>
        <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
          {delta >= 0 ? "+" : "−"}
          {money(Math.abs(delta))} since {first.date.slice(2)}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-12 touch-none"
        preserveAspectRatio="none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <filter id="mglow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="6" opacity="0.22" filter="url(#mglow)" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {hoverIdx != null && (
          <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={0} y2={H} stroke="#a3a3a3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-600 tabular-nums">
        <span>low {money(min)}</span>
        <span>high {money(max)}</span>
      </div>
    </div>
  );
}
