import { useEffect, useMemo, useRef, useState } from "react";
import {
  classifyTorchDelta,
  DEFAULT_TORCH_THRESHOLDS,
  type TorchThresholds,
} from "@shared/scan/torchFoil";
import { RARITY_GUIDE } from "@shared/scan/rarityGuide";
import RarityGuideSheet from "./RarityGuideSheet";
import { captureTorchDiff, type TorchDiffSample } from "../services/torchFoil";
import { startPreview, stopPreview } from "../services/scanner";
import { exportTextFile } from "../services/backup";
import { useBackClose } from "../hooks/useBackClose";
import { toast } from "./Toaster";

// Every tier you might be holding, straight from the rarity guide — a short
// hand-picked list meant you couldn't tag the very cards the classifier is
// worst at (Quarter Century, Starlight, Collector's…), which are exactly the
// samples worth collecting.
const TRUTHS = RARITY_GUIDE.map((e) => e.rarity);

// Trim the redundant "Rare" suffix for the chips, keeping names distinct.
function shortTruth(rarity: string): string {
  return rarity.replace(/\s*Rare$/, "") || rarity;
}

// Experimental torch-differential foil probe: measures the same card with the
// torch off then on (exposure locked) and shows where the light bounces back.
// This is the data-gathering harness for tuning classifyTorchDelta — tag each
// sample with the card's real rarity and share the JSON log back for tuning.
//
// Rendered as a fullscreen camera view, NOT a bottom sheet: the preview is
// drawn behind the webview, so it can only be seen through a transparent
// window. (As a sheet it sat on an opaque backdrop — the camera was running
// and aiming was pure guesswork.) The readout sits over a dark scrim at the
// bottom; the card frame above it stays see-through.
export default function TorchFoilLab({ onClose }: { onClose: () => void }) {
  useBackClose(onClose);
  const [busy, setBusy] = useState<string | null>(null);
  const [samples, setSamples] = useState<TorchDiffSample[]>([]);
  const [thresholds, setThresholds] = useState<TorchThresholds>(DEFAULT_TORCH_THRESHOLDS);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [selected, setSelected] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const startedRef = useRef(false);

  // Own the camera for as long as the lab is open (the page-transparency
  // class is ScanPage's job — one owner). The lab is reached from the Scan
  // tab's idle screen, so the scan loop is never running underneath.
  useEffect(() => {
    let cancelled = false;
    void startPreview().then(
      () => {
        if (cancelled) {
          void stopPreview();
          return;
        }
        startedRef.current = true;
      },
      () => !cancelled && setPreviewFailed(true)
    );
    return () => {
      cancelled = true;
      if (startedRef.current) void stopPreview();
    };
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
    setSelected(0); // show the reading just taken
  }

  function tagSelected(truth: string) {
    setSamples((prev) =>
      prev.map((s, i) => (i === selected ? { ...s, groundTruth: truth } : s))
    );
  }

  async function shareLog() {
    const outcome = await exportTextFile(
      `torch-foil-samples-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
      JSON.stringify(samples, null, 2)
    );
    if (outcome === "failed") toast("Couldn't save the log", "error");
  }

  // Re-run the classifier over the log with the live thresholds, so slider
  // tweaks show immediately how many tagged samples they'd get right.
  const rescored = useMemo(
    () => samples.map((s) => ({ s, v: classifyTorchDelta(s.delta, s.on, s.off, thresholds) })),
    [samples, thresholds]
  );
  const tagged = rescored.filter(({ s }) => s.groundTruth);
  const correct = tagged.filter(
    ({ s, v }) => v.rarity === s.groundTruth || (v.tier === "secret+" && /secret/i.test(s.groundTruth!))
  ).length;

  const latest = rescored[selected] ?? rescored[0];
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
    <div className="fixed inset-0 z-[60] flex flex-col">
      {/* Top bar — over the live preview. */}
      <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-xl leading-none"
          aria-label="Close the lab"
        >
          ×
        </button>
        <span className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur text-sm text-white">
          🔦 Torch foil lab
        </span>
        {/* The guide lives here — this is the screen where you're actually
            squinting at a foil trying to name it. */}
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-lg"
          aria-label="Open the rarity guide"
        >
          📖
        </button>
      </div>

      {/* Aiming window: deliberately transparent so the camera shows through. */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-10">
        {previewFailed ? (
          <p className="text-center text-sm text-white bg-black/60 backdrop-blur rounded-xl p-4">
            Couldn't start the camera. Close the lab and try again — the app
            needs camera permission, and no other app can be using it.
          </p>
        ) : (
          <div className="w-full max-w-[13rem] aspect-[59/86] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none" />
        )}
      </div>

      {/* Readout — a dark scrim keeps the numbers legible over the preview. */}
      <div className="bg-black/80 backdrop-blur-md max-h-[52vh] overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] rounded-t-2xl">
        <p className="text-[11px] text-neutral-400 mb-2">
          Fill the frame with one card, hold still, then Measure — the torch
          flashes once and the readout shows where the light bounced back. Tag
          and share samples only if the "Torch rarity check" toggle keeps
          guessing wrong.
        </p>

        <button
          type="button"
          onClick={measure}
          disabled={!!busy || previewFailed}
          className="btn-primary w-full py-3 text-sm disabled:opacity-50"
        >
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
                    onClick={() => tagSelected(t)}
                    className={`px-2 py-1 rounded text-[10px] border ${
                      latest.s.groundTruth === t
                        ? "bg-amber-400/20 border-amber-800/60 text-amber-200"
                        : "bg-raised border-line text-neutral-400"
                    }`}
                  >
                    {shortTruth(t)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Compare readings across cards. If two different rarities produce
            near-identical numbers here, no threshold can ever tell them apart
            and the problem is upstream (regions, exposure lock, torch) — which
            is the first thing worth knowing. */}
        {rescored.length > 1 && (
          <div className="mt-3">
            <span className="block text-[10px] text-neutral-500 mb-1">
              All readings — tap one to inspect and tag it:
            </span>
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="text-neutral-600 text-left">
                  <th className="font-normal">#</th>
                  <th className="font-normal">verdict</th>
                  <th className="font-normal text-right">Δname</th>
                  <th className="font-normal text-right">Δart</th>
                  <th className="font-normal text-right">Δall</th>
                  <th className="font-normal text-right">gold</th>
                  <th className="font-normal text-right">amb·hue</th>
                  <th className="font-normal">tagged</th>
                </tr>
              </thead>
              <tbody>
                {rescored.map(({ s, v }, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelected(i)}
                    className={i === selected ? "bg-amber-400/10 text-amber-200" : "text-neutral-400"}
                  >
                    <td>{rescored.length - i}</td>
                    <td className="truncate max-w-16">{v.tier}</td>
                    <td className="text-right">{s.delta.name.toFixed(2)}</td>
                    <td className="text-right">{s.delta.art.toFixed(2)}</td>
                    <td className="text-right">{s.delta.whole.toFixed(2)}</td>
                    <td className="text-right">{s.on.name.goldness.toFixed(2)}</td>
                    {/* Ambient art hue — the signal that survives torch glare. */}
                    <td className="text-right">{s.off.art.hueSpread.toFixed(2)}</td>
                    <td className="truncate max-w-16">
                      {s.groundTruth ? shortTruth(s.groundTruth) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {samples.length > 0 && (
          <>
            <div className="mt-3">
              <span className="block text-[10px] text-neutral-500 mb-1">
                Thresholds (re-scores the log live
                {tagged.length > 0 ? ` — ${correct}/${tagged.length} tagged correct` : ""}):
              </span>
              <div className="flex flex-col gap-1">
                <Slider k="minSignal" min={0.01} max={0.3} step={0.01} />
                <Slider k="dominant" min={0.01} max={0.2} step={0.01} />
                <Slider k="goldness" min={0.05} max={0.6} step={0.05} />
                <Slider k="hueSpread" min={0.1} max={0.7} step={0.05} />
                <Slider k="uniform" min={0.4} max={0.95} step={0.05} />
                <Slider k="saturated" min={0.3} max={0.9} step={0.05} />
                <Slider k="ambientHue" min={0.1} max={0.6} step={0.05} />
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

      {guideOpen && <RarityGuideSheet onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
