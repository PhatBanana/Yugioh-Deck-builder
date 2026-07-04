import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Ocr } from "@jcesarmobile/capacitor-ocr";
import {
  extractPasscodes,
  matchOcrLines,
  type NameCandidate,
  type NameMatch,
} from "@shared/scan/nameMatcher";
import { db } from "../db";

export interface ScanOutcome {
  matches: NameMatch[];
  rawLines: string[];
  // True when the top match came from the printed 8-digit passcode (exact id
  // lookup) rather than fuzzy name matching.
  matchedByPasscode?: boolean;
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

export async function setTorch(on: boolean): Promise<void> {
  try {
    await CameraPreview.setFlashMode({ flashMode: on ? "torch" : "off" });
  } catch {
    // Device may not have a torch; ignore.
  }
}

// Keeps the screen on for the duration of a scan session (phone in a mount,
// working through a stack of cards hands-free). Best-effort — falls back to
// normal sleep behavior on unsupported platforms/devices.
export async function setScreenAwake(on: boolean): Promise<void> {
  try {
    if (on) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
  } catch {
    // Not supported on this platform (e.g. web) — ignore.
  }
}

// Grabs one frame from the live preview and matches it. Returns empty matches
// (rather than throwing) if the preview isn't running so the scan loop can
// keep polling without crashing. High JPEG quality helps read the small
// passcode text.
export async function captureFrameAndMatch(): Promise<ScanOutcome> {
  if (!previewActive) return { matches: [], rawLines: [] };
  const { value } = await CameraPreview.captureSample({ quality: 92 });
  const cropped = await cropToCardRegion(`data:image/jpeg;base64,${value}`);
  return ocrAndMatch(cropped);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Trims the outer margins of the frame down to roughly where the card sits
// inside the on-screen framing guide. Cutting the background (table, hands,
// neighbouring cards) removes stray text and shrinks the image the OCR engine
// has to scan — faster and more accurate — while keeping the whole card, so
// both the name (top) and passcode (bottom-left) survive. Conservative on
// purpose: a gentle crop never clips card content if framing is a bit off.
async function cropToCardRegion(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const keepW = 0.86;
    const keepH = 0.9;
    const sw = Math.round(img.width * keepW);
    const sh = Math.round(img.height * keepH);
    const sx = Math.round((img.width - sw) / 2);
    const sy = Math.round((img.height - sh) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    // If anything about the canvas path fails, OCR the original frame.
    return dataUrl;
  }
}

async function ocrAndMatch(image: string): Promise<ScanOutcome> {
  const { results } = await Ocr.process({ image });
  const rawLines = results
    .flatMap((r) => r.text.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  // Prefer the printed passcode: an exact card-id lookup beats fuzzy name
  // matching whenever the number is legible.
  for (const id of extractPasscodes(rawLines)) {
    const card = await db.cards.get(id);
    if (card) {
      return {
        matches: [{ id: card.id, name: card.name, score: 1 }],
        rawLines,
        matchedByPasscode: true,
      };
    }
  }

  const candidates = await getNameCandidates();
  const matches = matchOcrLines(rawLines, candidates, { limit: 6, minScore: 0.55 });
  return { matches, rawLines };
}
