// On-device foil-family classifier seam.
//
// ADR-0001: the model classifies FOIL FAMILY (matte / holo-name / holo-art /
// gold-name / rainbow / unclear), never a rarity tier — the set-code index
// answers "which tiers could this be", vision answers "which finish is
// physically on the cardstock". Its output feeds the same reconcileRarity
// narrowing the heuristic foil pass uses today, and replaces that heuristic
// outright once a model ships (no fallback: the heuristic's failure mode is
// confident wrongness under glare, which the trained "unclear" abstain class
// exists to prevent).
//
// Runtime plan: tfjs-tflite (WASM + XNNPACK) in the webview — the model ships
// as a public asset inside the APK, preprocessing stays in JS canvas (same
// code path as training-data capture, no train/serve skew), and inference
// runs ONCE per committed card, not per scan tick. To enable:
//   1. `training/` produces a quantized .tflite; copy it to mobile/public/.
//   2. Add @tensorflow/tfjs-tflite, implement FoilModel.classify() mapping
//      the softmax to a FoilClass + confidence.
//   3. Return the instance from getFoilModel().
// Nothing else in the scan flow changes — commit() already asks.

import type { FoilClass } from "@shared/scan/rarityVision";
import { cropCardFromFrame } from "./trainingCapture";

export interface FoilModel {
  // Classifies a card crop into its foil family. "unclear" is the trained
  // abstain class — a positive "this frame is unreadable" verdict, not an
  // error. The image is any loadable URL (data or object URL).
  classify(imageUrl: string): Promise<{ family: FoilClass; confidence: number } | null>;
}

let cached: FoilModel | null | undefined;

// The bundled model, or null when none is available on this build/device.
// Memoised so the (future) model handle is created once.
export function getFoilModel(): FoilModel | null {
  if (cached === undefined) {
    cached = null; // no on-device foil model bundled yet
  }
  return cached;
}

// Below this the model's verdict is treated as no opinion.
export const MODEL_MIN_CONFIDENCE = 0.6;

// Runs the model once on a committed frame: crop to the detected card box,
// classify the crop. Null = no opinion (no model bundled, no card box found,
// low confidence, or error) — the caller keeps whatever signal it had.
// A returned "unclear" is a real verdict and flows into reconcileRarity,
// which already treats it as contributing nothing.
export async function classifyFoilFamily(frameDataUrl: string): Promise<FoilClass | null> {
  const model = getFoilModel();
  if (!model) return null;
  try {
    const crop = await cropCardFromFrame(frameDataUrl);
    if (!crop) return null; // no card box → abstain, never classify garbage
    const url = URL.createObjectURL(crop);
    try {
      const out = await model.classify(url);
      return out && out.confidence >= MODEL_MIN_CONFIDENCE ? out.family : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
