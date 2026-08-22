import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  SCAN_DELAY_MAX,
  SCAN_DELAY_MIN,
  type FlashMode,
  type ScanSettings,
} from "../hooks/useScanSettings";
import { installedLangs, installLangPack, LANGS, removeLangPack } from "../services/langPacks";
import {
  clearTrainingData,
  exportTrainingZip,
  trainingStats,
} from "../services/trainingCapture";
import { confirmDialog } from "./Confirm";
import { toast } from "./Toaster";
import BottomSheet from "./BottomSheet";

const FLASH_MODES: { id: FlashMode; label: string }[] = [
  { id: "continuous", label: "Steady" },
  { id: "pulse", label: "Pulse (less glare)" },
];

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-4 w-full text-left py-2"
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-neutral-500 mt-0.5">{hint}</span>}
      </span>
      <span
        className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
          on ? "bg-amber-500" : "bg-overlay"
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}

// Downloadable localized-name packs: each adds a language's card names to
// search and to the scanner's match pool (~1–2 MB per language).
function LanguagePacks() {
  const installed = useLiveQuery(installedLangs, []);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(code: string, label: string) {
    if (busy) return;
    setBusy(code);
    try {
      if (installed?.has(code)) {
        await removeLangPack(code);
        toast(`${label} names removed`, "success");
      } else {
        const n = await installLangPack(code);
        toast(`${label}: ${n.toLocaleString()} card names installed`, "success");
      }
    } catch {
      toast(`Couldn't download the ${label} pack — check your connection`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="py-3">
      <span className="block text-sm">Card languages</span>
      <span className="block text-xs text-neutral-500 mt-0.5 mb-2">
        Adds a language's card names to search and scanning (~0.5 MB each,
        Japanese 1.2 MB). Japanese/Korean cards can be found by typed search,
        but the camera can only read Latin-script text.
      </span>
      <div className="flex flex-wrap gap-1.5">
        {LANGS.map((l) => {
          const on = installed?.has(l.code) ?? false;
          return (
            <button
              key={l.code}
              type="button"
              disabled={busy !== null}
              onClick={() => toggle(l.code, l.label)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
                  : "bg-surface border-line text-neutral-300"
              } ${busy === l.code ? "opacity-60" : ""}`}
            >
              {busy === l.code ? "…" : on ? "✓" : "+"} {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Capture toggle + dataset footprint + export/clear. The dataset is card
// photos with confirmed rarities, feeding the foil-classifier training set —
// on-device only until the user exports it (see CONTEXT.md "Contribution").
function TrainingData({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  const stats = useLiveQuery(trainingStats, []);
  const [busy, setBusy] = useState(false);

  async function exportZip() {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await exportTrainingZip();
      if (outcome === "empty") toast("No training photos captured yet", "error");
      else if (outcome === "failed") toast("Export failed — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (busy) return;
    const ok = await confirmDialog({
      title: "Delete captured training photos?",
      message: `${(stats?.count ?? 0).toLocaleString()} card photos will be deleted from this phone. Export first if you want to keep them.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await clearTrainingData();
      toast("Training photos deleted", "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Toggle
        label="Capture training photos"
        hint="Saves a photo of each card whose rarity is certain (or that you confirm) to help train the rarity classifier. Stays on this phone until you export it."
        on={on}
        onChange={onChange}
      />
      {stats && stats.count > 0 && (
        <div className="flex items-center justify-between gap-3 pb-3 -mt-1">
          <span className="text-xs text-neutral-500">
            {stats.count.toLocaleString()} photo{stats.count === 1 ? "" : "s"} ·{" "}
            {(stats.bytes / (1024 * 1024)).toFixed(1)} MB
          </span>
          <span className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void exportZip()}
              className={`text-xs px-2.5 py-1 rounded-full border bg-surface border-line text-neutral-300 ${busy ? "opacity-60" : ""}`}
            >
              {busy ? "…" : "Export zip"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearAll()}
              className={`text-xs px-2.5 py-1 rounded-full border bg-surface border-line text-red-400 ${busy ? "opacity-60" : ""}`}
            >
              Clear
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

export default function ScanSettingsSheet({
  settings,
  update,
  onClose,
}: {
  settings: ScanSettings;
  update: (patch: Partial<ScanSettings>) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose} title="Scan settings" stickyHeader>

      <div className="divide-y divide-line">
        <Toggle
          label="Keep screen awake"
          hint="Stops the screen dimming/locking while scanning."
          on={settings.keepAwake}
          onChange={(v) => update({ keepAwake: v })}
        />
        <Toggle
          label="Beep when a card is added"
          hint="Hands-free confirmation — useful with the phone in a mount."
          on={settings.beepOnAdd}
          onChange={(v) => update({ beepOnAdd: v })}
        />
        <Toggle
          label="Vibrate when a card is added"
          hint="A short buzz on each add."
          on={settings.hapticOnAdd}
          onChange={(v) => update({ hapticOnAdd: v })}
        />
        <Toggle
          label="Detect edition & rarity"
          hint="Reads the set code (e.g. LOB-EN001) and 1st Edition mark to tag each copy's printing."
          on={settings.detectPrinting}
          onChange={(v) => update({ detectPrinting: v })}
        />
        {settings.detectPrinting && (
          <Toggle
            label="Auto foil check (torch)"
            hint="When a set code could be several rarities, the torch flashes once after the add — where the light reflects picks which one you're holding. Keep the card still until the flash. Single-rarity codes never flash."
            on={settings.autoFoilCheck}
            onChange={(v) => update({ autoFoilCheck: v })}
          />
        )}
        {settings.detectPrinting && (
          <TrainingData
            on={settings.captureTraining}
            onChange={(v) => update({ captureTraining: v })}
          />
        )}

        <div className="py-3">
          <span className="block text-sm">Flash style</span>
          <span className="block text-xs text-neutral-500 mt-0.5 mb-2">
            The light can't be dimmed, so Pulse fires it only during each
            read — much less glare on the card.
          </span>
          <div className="seg text-xs">
            {FLASH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => update({ flashMode: m.id })}
                className={`seg-btn py-1.5 ${settings.flashMode === m.id ? "seg-on" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Time between reads</span>
            <span className="text-sm text-neutral-400 tabular-nums">
              {(settings.scanDelayMs / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={SCAN_DELAY_MIN}
            max={SCAN_DELAY_MAX}
            step={100}
            value={settings.scanDelayMs}
            onChange={(e) => update({ scanDelayMs: Number(e.target.value) })}
            className="w-full mt-2 accent-amber-500"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-1">
            <span>Faster</span>
            <span>Fewer double-reads</span>
          </div>
        </div>

      <LanguagePacks />
      </div>
    </BottomSheet>
  );
}
