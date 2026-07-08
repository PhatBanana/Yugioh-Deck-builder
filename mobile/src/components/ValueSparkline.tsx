import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

// Small inline chart of collection value over time, fed by the daily
// snapshots recorded on app launch. Renders nothing until there are at least
// two days of data — a single point isn't a trend.
export default function ValueSparkline() {
  const history = useLiveQuery(
    () => db.valueHistory.orderBy("date").toArray(),
    [],
    []
  );
  if (history.length < 2) return null;

  const points = history.slice(-60); // last ~2 months
  const values = points.map((p) => p.valueUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 300;
  const H = 48;
  const PAD = 4;
  const path = points
    .map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((p.valueUsd - min) / range) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.valueUsd - first.valueUsd;
  const deltaText = `${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(0)}`;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-neutral-500">Collection value · {points.length} days</span>
        <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
          {deltaText} since {first.date.slice(5)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="#34d399" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
