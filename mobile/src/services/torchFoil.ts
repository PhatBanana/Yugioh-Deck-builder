import { CameraPreview } from "@capgo/camera-preview";
import type { FoilStats } from "@shared/scan/rarityVision";
import { classifyTorchDelta, deltaOf, type RegionDelta, type TorchVerdict } from "@shared/scan/torchFoil";
import { captureSampleFrame, measureFoilStats, setTorch } from "./scanner";

// Torch-differential capture: the same card measured torch-off then torch-on,
// with auto-exposure locked between the two frames so the specular readings
// are actually comparable (AE would otherwise renormalize the brightness the
// torch adds, erasing the signal we're after).

export interface TorchDiffSample {
  at: string; // ISO timestamp
  off: FoilStats;
  on: FoilStats;
  delta: RegionDelta;
  verdict: TorchVerdict;
  cardFound: boolean; // regions tracked the card (vs fixed-fraction fallback)
  exposureLocked: boolean; // AE lock actually engaged
  ms: number; // total capture time
  groundTruth?: string; // user-tagged real rarity, for tuning
}

const AE_SETTLE_MS = 400; // let AE settle on the ambient scene before locking
const TORCH_SETTLE_MS = 300; // torch ramp + sensor settle before the ON frame

async function trySetExposureMode(mode: string): Promise<boolean> {
  try {
    // Not in the plugin's TS surface on all platforms — call defensively.
    await (CameraPreview as unknown as {
      setExposureMode: (o: { mode: string }) => Promise<void>;
    }).setExposureMode({ mode });
    return true;
  } catch {
    return false;
  }
}

// Runs one off/on measurement pair. The preview must already be running.
// Returns null when a frame can't be captured or measured.
export async function captureTorchDiff(): Promise<TorchDiffSample | null> {
  const started = Date.now();
  let exposureLocked = false;
  try {
    // Let AE settle on ambient light, then freeze it for the pair.
    await new Promise((r) => setTimeout(r, AE_SETTLE_MS));
    exposureLocked = await trySetExposureMode("LOCK");

    const offUrl = await captureSampleFrame();
    if (!offUrl) return null;

    await setTorch(true);
    await new Promise((r) => setTimeout(r, TORCH_SETTLE_MS));
    const onUrl = await captureSampleFrame();
    await setTorch(false);
    if (!onUrl) return null;

    const [off, on] = await Promise.all([measureFoilStats(offUrl), measureFoilStats(onUrl)]);
    if (!off || !on) return null;

    const delta = deltaOf(off.stats, on.stats);
    return {
      at: new Date().toISOString(),
      off: off.stats,
      on: on.stats,
      delta,
      verdict: classifyTorchDelta(delta, on.stats, undefined, off.stats),
      cardFound: off.cardFound && on.cardFound,
      exposureLocked,
      ms: Date.now() - started,
    };
  } catch {
    return null;
  } finally {
    // Never leave the torch on or AE frozen, whatever happened above.
    await setTorch(false).catch(() => {});
    if (exposureLocked) await trySetExposureMode("AUTO");
  }
}
