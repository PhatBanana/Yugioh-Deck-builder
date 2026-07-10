import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getPriceHistory } from "../services/priceHistory";

const W = 300;
const H = 48;
const PAD = 4;

// Price-over-time chart for one card, fed by the daily price points recorded
// for owned/wishlisted cards. Same visual idiom as ValueSparkline, plus a
// touch/hover crosshair that reads out the date and price. Renders a "tracking
// started" note until there are two days of data, and nothing at all for
// untracked cards.
export default function PriceSparkline({ cardId }: { cardId: number }) {
  const history = useLiveQuery(() => getPriceHistory(cardId), [cardId], []);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (history.length === 0) return null;
  if (history.length === 1) {
    return (
      <p className="mt-3 pt-3 border-t border-line text-xs text-neutral-500">
        Price tracked since {history[0].date} — the chart appears once there
        are a few days of data.
      </p>
    );
  }

  const points = history.slice(-90); // last ~3 months
  const values = points.map((p) => p.priceUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xAt = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const yAt = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.priceUsd).toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.priceUsd - first.priceUsd;
  const deltaText = `${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(2)}`;
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  // The svg is stretched (preserveAspectRatio="none"), so map the pointer's
  // horizontal fraction of the element straight to a point index.
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-neutral-500">
          {hovered
            ? `${hovered.date} · $${hovered.priceUsd.toFixed(2)}`
            : `Price history · ${points.length} days`}
        </span>
        <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
          {deltaText} since {first.date.slice(5)}
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
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {hoverIdx != null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={0}
            y2={H}
            stroke="#a3a3a3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-600 tabular-nums">
        <span>low ${min.toFixed(2)}</span>
        <span>high ${max.toFixed(2)}</span>
      </div>
    </div>
  );
}
