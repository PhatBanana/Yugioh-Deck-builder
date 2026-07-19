import {
  SCAN_DELAY_MAX,
  SCAN_DELAY_MIN,
  type FlashMode,
  type ScanSettings,
} from "../hooks/useScanSettings";
import { useBackClose } from "../hooks/useBackClose";

const FLASH_MODES: { id: FlashMode; label: string }[] = [
  { id: "continuous", label: "Steady" },
  { id: "pulse", label: "Pulse (less glare)" },
];

const FOCUS_MODES: { id: "auto" | "macro"; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "macro", label: "Macro (close-up)" },
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

export default function ScanSettingsSheet({
  settings,
  update,
  onClose,
}: {
  settings: ScanSettings;
  update: (patch: Partial<ScanSettings>) => void;
  onClose: () => void;
}) {
  useBackClose(onClose);
  return (
    <div
      className="sheet-backdrop z-[70] flex items-end"
      onClick={onClose}
    >
      <div
        className="sheet w-full rounded-t-3xl p-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Scan settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-xl leading-none px-2"
            aria-label="Close settings"
          >
            ✕
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
            label="Detect edition & rarity"
            hint="Reads the set code (e.g. LOB-EN001) and 1st Edition mark to tag each copy's printing."
            on={settings.detectPrinting}
            onChange={(v) => update({ detectPrinting: v })}
          />

          <div className="py-3">
            <span className="block text-sm">Focus</span>
            <span className="block text-xs text-neutral-500 mt-0.5 mb-2">
              Macro locks focus close to the lens — sharper on a card held near
              the phone, and better at catching the foil.
            </span>
            <div className="seg text-xs">
              {FOCUS_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => update({ focusMode: m.id })}
                  className={`seg-btn py-1.5 ${settings.focusMode === m.id ? "seg-on" : ""}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}
