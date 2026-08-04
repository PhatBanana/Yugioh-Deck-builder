import { useEffect, useMemo, useRef, useState } from "react";
import {
  classifyTorchDelta,
  DEFAULT_TORCH_THRESHOLDS,
  type TorchThresholds,
} from "@shared/scan/torchFoil";
import { captureTorchDiff, type TorchDiffSample } from "../services/torchFoil";
import { startPreview, stopPreview } from "../services/scanner";
import { exportTextFile } from "../services/backup";
import { useBackClose } from "../hooks/useBackClose";
import { toast } from "./Toaster";

const TRUTHS = ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Ultimate Rare"];

// Experimental torch-differential foil probe: measures the same card with the
// torch off then on (exposure locked) and shows where the light bounces back.
// This is the data-gathering harness for tuning classifyTorchDelta — tag each
// sample with the card's real rarity and share the JSON log back for tuning.
export default function TorchFoilLab({
  scanning,
  setScanPaused,
  onClose,
}: {
  scanning: boolean; // the scan loop is running (lab opened mid-session)
  setScanPaused: (p: boolean) => void;
  onClose: () => void;
}) {
  useBackClose(onClose);
  const [busy, setBusy] = useState<string | null>(null);
  const [samples, setSamples] = useState<TorchDiffSample[]>([]);
  const [thresholds, setThresholds] = useState<TorchThresholds>(DEFAULT_TORCH_THRESHOLDS);
  const startedPreviewRef = useRef(false);

  // Mid-scan: idle the loop so its captures/pulses don't collide with ours.
  // Idle: run the preview ourselves (and make the page transparent so it
  // shows through for aiming).
  useEffect(() => {
    const root = document.documentElement;
    if (scanning) {
      setScanPaused(true);
    } else {
      void startPreview().then(() => {
        startedPreviewRef.current = true;
        root.classList.add("camera-scanning");
      });
    }
    return () => {
      if (scanning) setScanPaused(false);
      if (startedPreviewRef.current) {
        root.classList.remove("camera-scanning");
        void stopPreview();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function measure() {
    setBusy("Measuring (torch will flash)…");
    const s = await captureTorchDiff();
    setBusy(null);
    if (!s) {
      toast("Couldn't capture — is the camera running?", "error");
      return;
    }
    setSamples((prev) => [s, ...prev]);
  }

  function tagLast(truth: string) {
    setSamples((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, groundTruth: truth } : s))
    );
  }

  async function shareLog() {
    const ok = await exportTextFile(
      `torch-foil-samples-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
      JSON.stringify(samples, null, 2)
    );
    if (!ok) toast("Couldn't share the log", "error");
  }

  // Re-run the classifier over the log with the live thresholds, so slider
  // tweaks show immediately how many tagged samples they'd get right.
  const rescored = useMemo(
    () => samples.map((s) => ({ s, v: classifyTorchDelta(s.delta, s.on, thresholds) })),
    [samples, thresholds]
  );
  const tagged = rescored.filter(({ s }) => s.groundTruth);
  const correct = tagged.filter(
    ({ s, v }) => v.rarity === s.groundTruth || (v.tier === "secret+" && /secret/i.test(s.groundTruth!))
  ).length;

  const latest = rescored[0];
  const fmt = (x: number) => x.toFixed(3);

  function Slider({ k, min, max, step }: { k: keyof TorchThresholds; min: number; max: number; step: number }) {
    return (
      <label className="flex items-center gap-2 text-[11px] text-neutral-400">
        <span className="w-20">{k}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={thresholds[k]}
          onChange={(e) => setThresholds((t) => ({ ...t, [k]: Number(e.target.value) }))}
          className="flex-1 accent-amber-500"
        />
        <span className="w-10 text-right tabular-nums">{thresholds[k].toFixed(2)}</span>
      </label>
    );
  }

  return (
    <div className="sheet-backdrop z-[80] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">🔦 Torch foil lab</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Point the camera at a card, hold still, and Measure — the torch
          flashes once and the lab shows where the light bounced back. The
          "Torch rarity check" toggle in scan settings uses these readings live
          during scanning; this lab is for eyeballing the raw numbers (tag +
          share samples only if the toggle keeps guessing wrong).
        </p>

        <button type="button" onClick={measure} disabled={!!busy} className="btn-primary w-full py-3 text-sm">
          {busy ?? "⚡ Measure (torch flashes)"}
        </button>

        {latest && (
          <div className="panel mt-3 p-3 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-sm">
                {latest.v.tier}
                {latest.v.rarity ? ` (${latest.v.rarity})` : ""}
              </span>
              <span className="tabular-nums text-neutral-500">
                conf {Math.round(latest.v.confidence * 100)}% · {latest.s.ms}ms
              </span>
            </div>
            <div className="flex gap-1.5 mb-2 text-[10px]">
              <span className={latest.s.cardFound ? "text-emerald-400" : "text-orange-400"}>
                {latest.s.cardFound ? "✓ card tracked" : "⚠ fixed regions"}
              </span>
              <span className={latest.s.exposureLocked ? "text-emerald-400" : "text-orange-400"}>
                {latest.s.exposureLocked ? "✓ AE locked" : "⚠ AE auto"}
              </span>
            </div>
            <table className="w-full tabular-nums">
              <thead>
                <tr className="text-neutral-600 text-left">
                  <th className="font-normal">region</th>
                  <th className="font-normal text-right">off</th>
                  <th className="font-normal text-right">on</th>
                  <th className="font-normal text-right">Δ</th>
                  <th className="font-normal text-right">gold</th>
                  <th className="font-normal text-right">hue</th>
                </tr>
              </thead>
              <tbody>
                {(["name", "art", "whole"] as const).map((r) => (
                  <tr key={r}>
                    <td className="text-neutral-400">{r}</td>
                    <td className="text-right">{fmt(latest.s.off[r].specular)}</td>
                    <td className="text-right">{fmt(latest.s.on[r].specular)}</td>
                    <td className="text-right text-amber-300">{fmt(latest.s.delta[r])}</td>
                    <td className="text-right">{fmt(latest.s.on[r].goldness)}</td>
                    <td className="text-right">{fmt(latest.s.on[r].hueSpread)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[10px] text-neutral-600">{latest.v.reasons.join("; ")}</p>

            <div className="mt-2">
              <span className="block text-[10px] text-neutral-500 mb-1">
                Tag what this card really is:
              </span>
              <div className="flex gap-1 flex-wrap">
                {TRUTHS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => tagLast(t)}
                    className={`px-2 py-1 rounded text-[10px] border ${
                      latest.s.groundTruth === t
                        ? "bg-amber-400/20 border-amber-800/60 text-amber-200"
                        : "bg-raised border-line text-neutral-400"
                    }`}
                  >
                    {t.replace(" Rare", "")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {samples.length > 0 && (
          <>
            <div className="mt-3">
              <span className="block text-[10px] text-neutral-500 mb-1">
                Thresholds (re-scores the log live{tagged.length > 0 ? ` — ${correct}/${tagged.length} tagged correct` : ""}):
              </span>
              <div className="flex flex-col gap-1">
                <Slider k="minSignal" min={0.01} max={0.3} step={0.01} />
                <Slider k="dominant" min={0.01} max={0.2} step={0.01} />
                <Slider k="goldness" min={0.05} max={0.6} step={0.05} />
                <Slider k="hueSpread" min={0.1} max={0.7} step={0.05} />
                <Slider k="uniform" min={0.4} max={0.95} step={0.05} />
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button type="button" onClick={shareLog} className="btn-ghost flex-1 py-2.5 text-sm">
                📤 Share {samples.length} sample{samples.length === 1 ? "" : "s"} (JSON)
              </button>
              <button
                type="button"
                onClick={() => setSamples([])}
                className="btn-ghost px-4 py-2.5 text-sm text-neutral-500"
              >
                Clear
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
