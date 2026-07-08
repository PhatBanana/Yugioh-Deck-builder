import { useRef, useState } from "react";
import {
  CONDITION_LABEL,
  type CardAnalysis,
  type CardCondition,
} from "@shared/grading/analyze";
import { gradeCardPhoto, type GradePhotoResult } from "../services/grader";
import { toast } from "./Toaster";

function wearLabel(f: number): { text: string; className: string } {
  if (f < 0.03) return { text: "clean", className: "text-emerald-400" };
  if (f < 0.1) return { text: "minor", className: "text-amber-400" };
  if (f < 0.25) return { text: "worn", className: "text-orange-400" };
  return { text: "heavy", className: "text-red-400" };
}

function CornerBadge({ label, value }: { label: string; value: number }) {
  const w = wearLabel(value);
  return (
    <div className="rounded-lg bg-neutral-800/70 px-2 py-1.5 text-center">
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className={`text-xs font-medium ${w.className}`}>{w.text}</div>
    </div>
  );
}

function ResultView({ analysis }: { analysis: CardAnalysis }) {
  const { centering, wear, grade } = analysis;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-neutral-800/70 px-4 py-3">
        <div>
          <div className="text-xs text-neutral-500">Estimated condition</div>
          <div className="text-lg font-semibold">
            {CONDITION_LABEL[grade.condition]}{" "}
            <span className="text-neutral-500 text-sm">({grade.condition})</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">Rough grade</div>
          <div className="text-lg font-semibold tabular-nums">
            {grade.gradeRange[0] === grade.gradeRange[1]
              ? grade.gradeRange[0]
              : `${grade.gradeRange[0]}–${grade.gradeRange[1]}`}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-400 mb-1.5">Corners</div>
        <div className="grid grid-cols-4 gap-1.5">
          <CornerBadge label="Top L" value={wear.topLeft} />
          <CornerBadge label="Top R" value={wear.topRight} />
          <CornerBadge label="Bot L" value={wear.bottomLeft} />
          <CornerBadge label="Bot R" value={wear.bottomRight} />
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-neutral-500">Centering</span>
        <span className="tabular-nums">
          {centering.horizontalPct.join("/")} · {centering.verticalPct.join("/")} vert
        </span>
      </div>

      <ul className="text-xs text-neutral-400 list-disc pl-4">
        {grade.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Rough estimate from a single photo — lighting, glare and sleeves all skew it.
        Surface scratches aren't detected. Not a substitute for professional grading.
      </p>
    </div>
  );
}

// Bottom sheet that captures/picks a card photo, runs the rough grader, and
// (optionally) lets the result be saved as the card's condition.
export default function GradeCardSheet({
  onClose,
  onSaveCondition,
}: {
  onClose: () => void;
  // When provided, the result view offers saving the estimated condition.
  onSaveCondition?: (condition: CardCondition) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GradePhotoResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setBusy(true);
    try {
      const r = await gradeCardPhoto(file);
      if (!r) {
        toast("Couldn't find a card in that photo — use a plain, contrasting background", "error");
        return;
      }
      setResult(r);
    } catch (err) {
      toast(`Grading failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl bg-neutral-900 border border-neutral-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">Grade condition</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-2xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-400 leading-relaxed">
              Lay the card flat on a plain, contrasting surface (dark card → light table),
              fill most of the frame, avoid glare, and take a straight-on photo.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="w-full py-4 rounded-xl bg-emerald-700 active:bg-emerald-600 disabled:opacity-40 font-semibold"
            >
              {busy ? "Analyzing…" : "📷 Photograph card"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPick(f);
                e.target.value = ""; // allow re-picking the same file
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <img
              src={result.previewUrl}
              alt="Graded card"
              className="w-full max-h-56 object-contain rounded-lg bg-neutral-950"
            />
            <ResultView analysis={result.analysis} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 active:bg-neutral-700 text-sm"
              >
                Retake
              </button>
              {onSaveCondition && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveCondition(result.analysis.grade.condition);
                    onClose();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-700 active:bg-emerald-600 text-sm font-medium"
                >
                  Save as {result.analysis.grade.condition}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
