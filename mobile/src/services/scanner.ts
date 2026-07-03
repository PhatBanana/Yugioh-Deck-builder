import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { Ocr } from "@jcesarmobile/capacitor-ocr";
import { matchOcrLines, type NameCandidate, type NameMatch } from "@shared/scan/nameMatcher";
import { db } from "../db";

export interface ScanOutcome {
  matches: NameMatch[];
  rawLines: string[];
}

let candidateCache: NameCandidate[] | null = null;

export async function getNameCandidates(): Promise<NameCandidate[]> {
  if (!candidateCache) {
    candidateCache = (await db.cards.toArray()).map((c) => ({ id: c.id, name: c.name }));
  }
  return candidateCache;
}

export function invalidateCandidateCache(): void {
  candidateCache = null;
}

export function isScanSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// ---- One-shot capture (kept as a manual fallback) ----------------------

export async function scanCard(): Promise<ScanOutcome> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 90,
    correctOrientation: true,
    saveToGallery: false,
  });
  const image = photo.path ?? photo.webPath;
  if (!image) throw new Error("Camera returned no image");
  return ocrAndMatch(image);
}

// ---- Live preview + continuous frame grabbing --------------------------

let previewActive = false;

// Starts the camera preview rendered behind the webview. The caller must make
// the page background transparent (see ScanPage) so the preview shows through.
export async function startPreview(): Promise<void> {
  if (previewActive) return;
  await CameraPreview.start({
    position: "rear",
    toBack: true,
    disableAudio: true,
    width: window.screen.width,
    height: window.screen.height,
  });
  previewActive = true;
}

export async function stopPreview(): Promise<void> {
  if (!previewActive) return;
  previewActive = false;
  try {
    await CameraPreview.stop();
  } catch {
    // Preview may already be torn down (e.g. app backgrounded).
  }
}

export function isPreviewActive(): boolean {
  return previewActive;
}

export async function setTorch(on: boolean): Promise<void> {
  try {
    await CameraPreview.setFlashMode({ flashMode: on ? "torch" : "off" });
  } catch {
    // Device may not have a torch; ignore.
  }
}

// Grabs one frame from the live preview and matches it. Returns empty matches
// (rather than throwing) if the preview isn't running so the scan loop can
// keep polling without crashing.
export async function captureFrameAndMatch(): Promise<ScanOutcome> {
  if (!previewActive) return { matches: [], rawLines: [] };
  const { value } = await CameraPreview.captureSample({ quality: 70 });
  return ocrAndMatch(`data:image/jpeg;base64,${value}`);
}

async function ocrAndMatch(image: string): Promise<ScanOutcome> {
  const { results } = await Ocr.process({ image });
  const rawLines = results
    .flatMap((r) => r.text.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  const candidates = await getNameCandidates();
  const matches = matchOcrLines(rawLines, candidates, { limit: 6, minScore: 0.55 });
  return { matches, rawLines };
}
