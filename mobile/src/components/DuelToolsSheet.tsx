import { useState } from "react";
import { useBackClose } from "../hooks/useBackClose";

// Table-side duel tools: two life point counters, coin flip and a d6.

const LP_START = 8000;
const LP_STEPS = [100, 500, 1000] as const;

function LpCounter({
  label,
  lp,
  onChange,
}: {
  label: string;
  lp: number;
  onChange: (next: number) => void;
}) {
  const [sign, setSign] = useState<-1 | 1>(-1);
  return (
    <div className="panel flex-1 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-neutral-500">{label}</span>
        <button
          type="button"
          onClick={() => setSign((s) => (s === -1 ? 1 : -1))}
          className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
            sign === -1 ? "bg-red-950/70 text-red-300" : "bg-emerald-950/70 text-emerald-300"
          }`}
          aria-label="Toggle damage or gain"
        >
          {sign === -1 ? "− dmg" : "+ gain"}
        </button>
      </div>
      <div
        className={`text-3xl font-bold tabular-nums text-center ${
          lp <= 0 ? "text-red-400" : lp <= 2000 ? "text-orange-300" : ""
        }`}
      >
        {Math.max(0, lp).toLocaleString()}
      </div>
      <div className="flex gap-1.5 mt-2">
        {LP_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onChange(lp + sign * step)}
            className="pressable flex-1 py-2 rounded-lg bg-raised border border-line active:bg-overlay text-xs tabular-nums"
          >
            {step}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(Math.ceil(lp / 2 / 50) * 50)}
          className="pressable flex-1 py-2 rounded-lg bg-raised border border-line active:bg-overlay text-xs"
        >
          ½
        </button>
      </div>
    </div>
  );
}

export default function DuelToolsSheet({ onClose }: { onClose: () => void }) {
  useBackClose(onClose);
  const [lp1, setLp1] = useState(LP_START);
  const [lp2, setLp2] = useState(LP_START);
  const [result, setResult] = useState<string | null>(null);

  function flip() {
    setResult(`🪙 ${Math.random() < 0.5 ? "Heads" : "Tails"}`);
  }
  function roll() {
    setResult(`🎲 ${1 + Math.floor(Math.random() * 6)}`);
  }
  function reset() {
    setLp1(LP_START);
    setLp2(LP_START);
    setResult(null);
  }

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Duel tools</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex gap-2">
          <LpCounter label="You" lp={lp1} onChange={setLp1} />
          <LpCounter label="Opponent" lp={lp2} onChange={setLp2} />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button type="button" onClick={flip} className="btn-ghost flex-1 py-2.5 text-sm">
            🪙 Coin flip
          </button>
          <button type="button" onClick={roll} className="btn-ghost flex-1 py-2.5 text-sm">
            🎲 Roll d6
          </button>
          <button type="button" onClick={reset} className="btn-ghost px-4 py-2.5 text-sm">
            Reset
          </button>
        </div>
        {result && (
          <div className="text-center text-2xl font-semibold mt-3" role="status">
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
