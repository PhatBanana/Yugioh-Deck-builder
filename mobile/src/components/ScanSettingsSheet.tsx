import {
  SCAN_DELAY_MAX,
  SCAN_DELAY_MIN,
  type ScanSettings,
} from "../hooks/useScanSettings";

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
          on ? "bg-emerald-600" : "bg-neutral-700"
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
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-neutral-900 border-t border-neutral-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="divide-y divide-neutral-800">
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
              className="w-full mt-2 accent-emerald-500"
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
