// On-device rarity classifier seam (the "real AI" path).
//
// Rarity is ultimately a visual property, so the accurate long-term answer is
// a learned image classifier running on the device's NPU — a TensorFlow-Lite
// model driven through ML Kit's custom-model API, which the S24 Ultra runs on
// its dedicated accelerator. That needs a trained model (and a labelled
// dataset of card photos across rarities) which we don't have yet, so this is
// scaffolding: the scan pipeline already asks for a classifier and folds its
// answer in when present, and returns nothing until a model is dropped in.
//
// To enable it:
//   1. Add a TFLite bridge dependency (e.g. a @capacitor-mlkit custom image
//      labeler, or a capacitor-tflite plugin).
//   2. Implement classify() to run the model on the card crop and map its top
//      label + score to a { rarity, confidence } (rarity strings should match
//      the card DB's, e.g. "Secret Rare").
//   3. Return the instance from getRarityClassifier().
// Nothing else in the scan flow needs to change — reconcileRarity already
// treats a model answer as the strongest signal.

export interface RarityClassifier {
  classify(imageDataUrl: string): Promise<{ rarity: string; confidence: number } | null>;
}

let cached: RarityClassifier | null | undefined;

// The bundled classifier, or null when none is available on this build/device.
// Memoised so the (future) native model handle is created once.
export function getRarityClassifier(): RarityClassifier | null {
  if (cached === undefined) {
    cached = null; // no on-device rarity model bundled yet
  }
  return cached;
}

// Minimum confidence before a model answer is trusted over the set code.
export const MODEL_MIN_CONFIDENCE = 0.6;

// Runs the classifier on a card crop when one exists; a no-op (null) otherwise,
// so today it costs nothing per scan.
export async function classifyRarity(imageDataUrl: string): Promise<string | null> {
  const clf = getRarityClassifier();
  if (!clf) return null;
  try {
    const out = await clf.classify(imageDataUrl);
    return out && out.confidence >= MODEL_MIN_CONFIDENCE ? out.rarity : null;
  } catch {
    return null;
  }
}
