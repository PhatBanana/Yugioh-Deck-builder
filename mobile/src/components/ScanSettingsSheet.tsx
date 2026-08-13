import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  SCAN_DELAY_MAX,
  SCAN_DELAY_MIN,
  type FlashMode,
  type ScanSettings,
} from "../hooks/useScanSettings";
import { useBackClose } from "../hooks/useBackClose";
import TorchFoilLab from "./TorchFoilLab";
import RarityGuideSheet from "./RarityGuideSheet";
import { installedLangs, installLangPack, LANGS, removeLangPack } from "../services/langPacks";
import { toast } from "./Toaster";

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

export default function ScanSettingsSheet({
  settings,
  update,
  scanning,
  setScanPaused,
  onClose,
}: {
  settings: ScanSettings;
  update: (patch: Partial<ScanSettings>) => void;
  scanning: boolean;
  setScanPaused: (p: boolean) => void;
  onClose: () => void;
}) {
  useBackClose(onClose);
  const [labOpen, setLabOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <div
      className="sheet-backdrop z-[70] flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {/* Sticky: this is the app's longest sheet, so the close button must
            stay reachable however far down you scroll. */}
        <div className="sticky top-0 z-10 -mx-5 px-5 -mt-1 pt-1 pb-2 mb-1 bg-surface flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scan settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-xl leading-none px-2"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

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
              label="Torch rarity check (experimental)"
              hint="After each card is added, the torch flashes once — where the light reflects helps pick which rarity you're holding. Keep the card still until the flash."
              on={settings.torchRarity}
              onChange={(v) => update({ torchRarity: v })}
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

        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="btn-ghost w-full py-2.5 text-sm mt-4"
        >
          📖 Rarity guide — what each foil looks like
        </button>
        <button
          type="button"
          onClick={() => setLabOpen(true)}
          className="btn-ghost w-full py-2.5 text-sm mt-2"
        >
          🔦 Torch foil lab (experimental)
        </button>
      </div>
      {guideOpen && <RarityGuideSheet onClose={() => setGuideOpen(false)} />}
      {labOpen && (
        <TorchFoilLab
          scanning={scanning}
          setScanPaused={setScanPaused}
          onClose={() => setLabOpen(false)}
        />
      )}
    </div>
  );
}
