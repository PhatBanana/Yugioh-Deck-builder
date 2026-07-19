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
import { detectEdition, extractSetCode } from "@shared/scan/setCode";
import { classifyFoil, type FoilClass, type FoilStats, type RegionStat } from "@shared/scan/rarityVision";
import { db } from "../db";
import { classifyRarity } from "./rarityModel";

export interface ScanOutcome {
  matches: NameMatch[];
  rawLines: string[];
  // True when the top match came from the printed 8-digit passcode (exact id
  // lookup) rather than fuzzy name matching.
  matchedByPasscode?: boolean;
  // Set code (e.g. "SDCB-EN001") and edition marking read off the same frame,
  // used to infer the copy's printing/rarity. Either may be absent.
  setCode?: string | null;
  edition?: string;
  // Visual foil class from the frame (second-pass rarity signal), and a
  // learned-model rarity if an on-device classifier is bundled.
  foil?: FoilClass;
  modelRarity?: string | null;
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

// ---- Camera controls (zoom/refocus are patched-in native methods; see
// mobile/patches/@capacitor-community+camera-preview+8.0.1.patch). The
// Capacitor plugin proxy forwards any method name to native, so we extend the
// type locally. Everything is best-effort — no-ops in the browser.

export interface ZoomState {
  supported: boolean;
  max: number; // device zoom index range is 0..max (not a ratio)
  current: number;
}

const CameraPreviewX = CameraPreview as typeof CameraPreview & {
  setZoom(options: { level: number }): Promise<void>;
  getZoomState(): Promise<ZoomState>;
  refocus(): Promise<void>;
  setFocusMode(options: { mode: FocusMode }): Promise<void>;
};

// "auto" = continuous autofocus (default); "macro" = close-up focus, sharper on
// a card held near the lens and better at resolving foil texture.
export type FocusMode = "auto" | "macro";

export async function setFocusMode(mode: FocusMode): Promise<void> {
  try {
    await CameraPreviewX.setFocusMode({ mode });
  } catch {
    // Unsupported focus mode / not running — ignore.
  }
}

// Switches between the rear and front camera. Zoom/torch reset with the new
// camera, so callers should re-apply what they need.
export async function flipCamera(): Promise<void> {
  try {
    await CameraPreviewX.flip();
  } catch {
    // Single-camera device; ignore.
  }
}

export async function setZoomLevel(level: number): Promise<void> {
  try {
    await CameraPreviewX.setZoom({ level });
  } catch {
    // Unsupported camera or not running; ignore.
  }
}

export async function getZoomState(): Promise<ZoomState> {
  try {
    return await CameraPreviewX.getZoomState();
  } catch {
    return { supported: false, max: 0, current: 0 };
  }
}

// One-shot autofocus trigger (tap-to-refocus).
export async function refocusCamera(): Promise<void> {
  try {
    await CameraPreviewX.refocus();
  } catch {
    // ignore
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
  const { image, foil } = await prepareFrame(`data:image/jpeg;base64,${value}`);
  return ocrAndMatch(image, foil);
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
// inside the on-screen framing guide, and measures the card's foil signature
// off the same canvas. Cropping the background (table, hands, neighbouring
// cards) removes stray text and shrinks the image the OCR engine has to scan —
// faster and more accurate — while keeping the whole card, so both the name
// (top) and passcode (bottom-left) survive. Conservative on purpose: a gentle
// crop never clips card content if framing is a bit off.
async function prepareFrame(dataUrl: string): Promise<{ image: string; foil?: FoilClass }> {
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
    if (!ctx) return { image: dataUrl };
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const image = canvas.toDataURL("image/jpeg", 0.95);
    let foil: FoilClass | undefined;
    try {
      foil = classifyFoil(readFoilStats(ctx, sw, sh));
    } catch {
      // Pixel read blocked (rare) — skip the visual pass for this frame.
    }
    return { image, foil };
  } catch {
    // If anything about the canvas path fails, OCR the original frame.
    return { image: dataUrl };
  }
}

// Per-region brightness/colour stats used to classify the card's foil. The
// regions are fractions of the cropped card: the name plate across the top,
// the artwork box, and the whole card (for rainbow foil that spans it).
function readFoilStats(ctx: CanvasRenderingContext2D, w: number, h: number): FoilStats {
  const region = (x0: number, y0: number, x1: number, y1: number): RegionStat =>
    regionStat(ctx, Math.round(x0 * w), Math.round(y0 * h), Math.round((x1 - x0) * w), Math.round((y1 - y0) * h));
  return {
    name: region(0.08, 0.04, 0.92, 0.13),
    art: region(0.12, 0.16, 0.88, 0.52),
    whole: region(0.03, 0.03, 0.97, 0.97),
  };
}

function regionStat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): RegionStat {
  if (w <= 0 || h <= 0) return { specular: 0, hueSpread: 0, goldness: 0 };
  const { data } = ctx.getImageData(x, y, w, h);
  const px = w * h;
  const stride = Math.max(1, Math.floor(px / 4000)); // ~4k samples per region
  let total = 0;
  let bright = 0;
  let gold = 0;
  let sinSum = 0;
  let cosSum = 0;
  let hueCount = 0;
  for (let p = 0; p < px; p += stride) {
    const o = p * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    total++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.8) continue;
    bright++;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.2) continue; // white glare carries no colour signal
    const hue = hueDeg(r, g, b, max, min);
    if (hue >= 38 && hue <= 68) gold++;
    const rad = (hue * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
    hueCount++;
  }
  const specular = total ? bright / total : 0;
  const goldness = bright ? gold / bright : 0;
  // Circular spread: 1 − mean resultant length. Wide, varied hues → near 1.
  const hueSpread =
    hueCount >= 8 ? 1 - Math.sqrt(sinSum * sinSum + cosSum * cosSum) / hueCount : 0;
  return { specular, hueSpread, goldness };
}

function hueDeg(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

async function ocrAndMatch(image: string, foil?: FoilClass): Promise<ScanOutcome> {
  const { results } = await Ocr.process({ image });
  const rawLines = results
    .flatMap((r) => r.text.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  // Set code + edition come from the same OCR text regardless of how the card
  // itself was identified (passcode or name). The on-device model (when
  // bundled) reads the card crop; today it returns null with no cost.
  const setCode = extractSetCode(rawLines);
  const edition = detectEdition(rawLines);
  const modelRarity = await classifyRarity(image);

  // Prefer the printed passcode: an exact card-id lookup beats fuzzy name
  // matching whenever the number is legible.
  for (const id of extractPasscodes(rawLines)) {
    const card = await db.cards.get(id);
    if (card) {
      return {
        matches: [{ id: card.id, name: card.name, score: 1 }],
        rawLines,
        matchedByPasscode: true,
        setCode,
        edition,
        foil,
        modelRarity,
      };
    }
  }

  const candidates = await getNameCandidates();
  const matches = matchOcrLines(rawLines, candidates, { limit: 6, minScore: 0.55 });
  return { matches, rawLines, setCode, edition, foil, modelRarity };
}
