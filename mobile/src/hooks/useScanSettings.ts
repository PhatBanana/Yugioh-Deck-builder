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
  /** Vibrate briefly when a card is added. */
  hapticOnAdd: boolean;
  /** Torch style when the 🔦 toggle is on. */
  flashMode: FlashMode;
  /** Last-used camera zoom ratio (1 = main lens; >1 reaches the telephoto,
   *  <1 the ultra-wide on multi-camera phones). */
  zoomRatio: number;
  /** Read the set code + edition off each card to tag its printing/rarity.
   *  Costs a per-card printings lookup (cached after first fetch). */
  detectPrinting: boolean;
  /** Experimental: after each add, flash the torch once and read where the
   *  light reflects (foil signature) to pick between a code's rarities. */
  torchRarity: boolean;
  /** Save a card photo + its confirmed rarity to the on-device training set
   *  (for the foil classifier). Stays on the phone until exported. */
  captureTraining: boolean;
}

export const SCAN_DELAY_MIN = 600;
export const SCAN_DELAY_MAX = 4000;

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  keepAwake: true,
  scanDelayMs: 2000,
  beepOnAdd: false,
  hapticOnAdd: true,
  flashMode: "continuous",
  zoomRatio: 1,
  detectPrinting: true,
  torchRarity: false,
  captureTraining: true,
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
