import { useCallback, useState } from "react";

/** How the torch behaves while scanning. Android exposes no torch dimming
 *  while the camera session owns the light, so glare is reduced by pulsing:
 *  the light fires only around each read instead of burning continuously. */
export type FlashMode = "continuous" | "pulse";

export interface ScanSettings {
  /** Keep the screen from dimming/locking while a scan session is active. */
  keepAwake: boolean;
  /** Delay between OCR passes, ms. Longer = fewer double-reads, shorter = faster. */
  scanDelayMs: number;
  /** Play a short beep when a card is added (hands-free confirmation). */
  beepOnAdd: boolean;
  /** Torch style when the 🔦 toggle is on. */
  flashMode: FlashMode;
}

export const SCAN_DELAY_MIN = 600;
export const SCAN_DELAY_MAX = 4000;

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  keepAwake: true,
  scanDelayMs: 2000,
  beepOnAdd: false,
  flashMode: "continuous",
};

const STORAGE_KEY = "ygo-scan-settings";

function load(): ScanSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCAN_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ScanSettings>;
    const merged = { ...DEFAULT_SCAN_SETTINGS, ...parsed };
    // Clamp the delay in case an old/edited value is out of range.
    merged.scanDelayMs = Math.min(
      SCAN_DELAY_MAX,
      Math.max(SCAN_DELAY_MIN, merged.scanDelayMs)
    );
    return merged;
  } catch {
    return DEFAULT_SCAN_SETTINGS;
  }
}

export function useScanSettings() {
  const [settings, setSettings] = useState<ScanSettings>(load);

  const update = useCallback((patch: Partial<ScanSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures — settings just won't persist.
      }
      return next;
    });
  }, []);

  return { settings, update };
}
