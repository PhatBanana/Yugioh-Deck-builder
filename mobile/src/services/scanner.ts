import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capgo/camera-preview";
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
import { cardFoilRegions, type FoilRegions } from "@shared/scan/foilRegions";
import { detectCardBounds } from "@shared/grading/analyze";
import { db } from "../db";
import { invalidateSearchIndex } from "./cardSearch";

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
  // Visual foil class from the frame (second-pass rarity signal). The learned
  // foil-family model runs once per committed card (see rarityModel.ts), not
  // here on every tick.
  foil?: FoilClass;
  // The raw (uncropped, full-res) frame this outcome was read from, for the
  // foil model and training-data capture at commit time. Transient — dropped
  // with the tick.
  frame?: string;
}

let candidateCache: NameCandidate[] | null = null;

export async function getNameCandidates(): Promise<NameCandidate[]> {
  if (!candidateCache) {
    const cards = (await db.cards.toArray()).map((c) => ({ id: c.id, name: c.name }));
    // Localized names from installed language packs join the pool — the same
    // fuzzy matcher then resolves e.g. a German-print card to its card id.
    const alts = (await db.altNames.toArray()).map((a) => ({ id: a.cardId, name: a.name }));
    candidateCache = cards.concat(alts);
  }
  return candidateCache;
}

export function invalidateCandidateCache(): void {
  candidateCache = null;
  // The search index is built from the same tables (cards + altNames) and
  // goes stale at exactly the same moments — one choke point for both.
  invalidateSearchIndex();
}

export function isScanSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// ---- Live preview + continuous frame grabbing --------------------------

let previewActive = false;

// Starts the camera preview rendered behind the webview. The caller must make
// the page background transparent (see ScanPage) so the preview shows through.
// enablePhysicalDeviceSelection lets zoom reach the device's telephoto /
// ultra-wide lenses (real optical zoom) on multi-camera phones.
export async function startPreview(): Promise<void> {
  if (previewActive) return;
  await CameraPreview.start({
    position: "rear",
    toBack: true,
    disableAudio: true,
    width: window.screen.width,
    height: window.screen.height,
    enablePhysicalDeviceSelection: true,
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

// ---- Camera controls. Zoom is a ratio (1× = the main lens); on multi-camera
// phones the native layer switches to the ultra-wide / telephoto lens as the
// ratio crosses each lens's range, so this is real optical zoom, not a crop.
// Everything is best-effort — no-ops in the browser.

export interface ZoomState {
  supported: boolean;
  min: number; // minimum zoom ratio (e.g. 0.5 when an ultra-wide is present)
  max: number; // maximum zoom ratio
  current: number; // current zoom ratio
  // Quick-jump lens ratios the device offers, e.g. [0.5, 1, 2, 3].
  buttons: number[];
}

const NO_ZOOM: ZoomState = { supported: false, min: 1, max: 1, current: 1, buttons: [] };

// Switches between the rear and front camera. Zoom/torch reset with the new
// camera, so callers should re-apply what they need.
export async function flipCamera(): Promise<void> {
  try {
    await CameraPreview.flip();
  } catch {
    // Single-camera device; ignore.
  }
}

// Sets the zoom ratio (auto-selecting the matching physical lens).
export async function setZoomLevel(level: number): Promise<void> {
  try {
    await CameraPreview.setZoom({ level });
  } catch {
    // Unsupported camera or not running; ignore.
  }
}

export async function getZoomState(): Promise<ZoomState> {
  try {
    const [z, b] = await Promise.all([
      CameraPreview.getZoom(),
      CameraPreview.getZoomButtonValues().catch(() => ({ values: [] as number[] })),
    ]);
    return {
      supported: z.max > z.min,
      min: z.min,
      max: z.max,
      current: z.current,
      buttons: b.values ?? [],
    };
  } catch {
    return NO_ZOOM;
  }
}

// Refocuses on the centre of the frame (tap-to-refocus). The plugin has no
// autofocus trigger, so we nudge the focus point to recentre it.
export async function refocusCamera(): Promise<void> {
  try {
    await CameraPreview.setFocus({ x: 0.5, y: 0.5 });
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
  const raw = `data:image/jpeg;base64,${value}`;
  const { image, foil } = await prepareFrame(raw);
  const outcome = await ocrAndMatch(image, foil);
  outcome.frame = raw;
  return outcome;
}

// Captures one raw preview frame as a data URL — no crop, OCR or matching.
// Used by the torch-diff lab, which does its own paired measurement.
export async function captureSampleFrame(): Promise<string | null> {
  if (!previewActive) return null;
  const { value } = await CameraPreview.captureSample({ quality: 92 });
  return `data:image/jpeg;base64,${value}`;
}

// Measures a frame's foil stats exactly the way the scan loop does (same
// center crop, same card-tracked regions with fixed-fraction fallback).
// Exposed for the torch-diff lab so its numbers match production sampling.
export async function measureFoilStats(
  dataUrl: string
): Promise<{ stats: FoilStats; cardFound: boolean } | null> {
  try {
    const img = await loadImage(dataUrl);
    const sw = Math.round(img.width * 0.86);
    const sh = Math.round(img.height * 0.9);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, Math.round((img.width - sw) / 2), Math.round((img.height - sh) / 2), sw, sh, 0, 0, sw, sh);
    const regions = findCardRegions(ctx, sw, sh);
    return { stats: readFoilStats(ctx, sw, sh, regions), cardFound: regions != null };
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Focused retry for the set code. The full-frame OCR reads card names fine
// but the set code is ~2mm print — at preview resolution it's a handful of
// pixels and usually comes back as nothing (observed: sessions of 20 scans
// with names matched and zero codes read). This re-reads just the code strip
// — right-aligned under the art box on standard frames — cropped from the
// raw frame at the detected card's position and upscaled 3× so the glyphs
// are big enough for ML Kit. One extra OCR pass, run only at commit time
// and only when the tick's full-frame pass missed the code.
export async function ocrSetCodeStrip(frameDataUrl: string): Promise<string | null> {
  try {
    const img = await loadImage(frameDataUrl);
    // Find the card in the raw frame (small downscale — bounds don't need
    // resolution), then map back to full-res pixels.
    const scale = Math.min(1, 220 / img.width);
    const dw = Math.max(1, Math.round(img.width * scale));
    const dh = Math.max(1, Math.round(img.height * scale));
    const small = document.createElement("canvas");
    small.width = dw;
    small.height = dh;
    const sctx = small.getContext("2d");
    if (!sctx) return null;
    sctx.drawImage(img, 0, 0, dw, dh);
    const bounds = detectCardBounds({
      data: sctx.getImageData(0, 0, dw, dh).data,
      width: dw,
      height: dh,
    });

    // Card-relative strip around the code line. Measured on real card
    // geometry: the art box ends at y≈0.68 and the code prints in the gap
    // above the type line, ≈y 0.685–0.715, right-aligned. The strip brackets
    // that with margin on both sides for tilt and loose bounds.
    const STRIP = { x0: 0.3, x1: 0.98, y0: 0.6, y1: 0.8 };
    let sx: number, sy: number, sw: number, sh: number;
    if (bounds) {
      const fx = img.width / dw;
      const fy = img.height / dh;
      const left = bounds.left * fx;
      const top = bounds.top * fy;
      const cw = (bounds.right - bounds.left) * fx;
      const ch = (bounds.bottom - bounds.top) * fy;
      sx = left + STRIP.x0 * cw;
      sy = top + STRIP.y0 * ch;
      sw = (STRIP.x1 - STRIP.x0) * cw;
      sh = (STRIP.y1 - STRIP.y0) * ch;
    } else {
      // No card box — assume the framing guide's center placement (the same
      // assumption the fixed foil regions make) and compose the strip with
      // the 0.86×0.90 guide crop.
      sx = img.width * (0.07 + 0.86 * STRIP.x0);
      sy = img.height * (0.05 + 0.9 * STRIP.y0);
      sw = img.width * 0.86 * (STRIP.x1 - STRIP.x0);
      sh = img.height * 0.9 * (STRIP.y1 - STRIP.y0);
    }
    if (sw < 40 || sh < 12) return null;

    const UPSCALE = 3;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * UPSCALE);
    canvas.height = Math.round(sh * UPSCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const { results } = await Ocr.process({ image: canvas.toDataURL("image/jpeg", 0.95) });
    const lines = results.flatMap((r) => r.text.split("\n")).map((l) => l.trim());
    return extractSetCode(lines);
  } catch {
    return null;
  }
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
      foil = classifyFoil(readFoilStats(ctx, sw, sh, findCardRegions(ctx, sw, sh)));
    } catch {
      // Pixel read blocked (rare) — skip the visual pass for this frame.
    }
    return { image, foil };
  } catch {
    // If anything about the canvas path fails, OCR the original frame.
    return { image: dataUrl };
  }
}

// Locates the card inside the cropped frame so the foil regions track the
// card itself instead of fixed screen fractions (which mostly measured the
// table behind it). Runs on a small downscale — bounds detection doesn't need
// resolution. Null when no plausible card box is found.
function findCardRegions(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): FoilRegions | null {
  try {
    const scale = Math.min(1, 220 / w);
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const small = document.createElement("canvas");
    small.width = dw;
    small.height = dh;
    const sctx = small.getContext("2d");
    if (!sctx) return null;
    sctx.drawImage(ctx.canvas, 0, 0, dw, dh);
    const bounds = detectCardBounds({ data: sctx.getImageData(0, 0, dw, dh).data, width: dw, height: dh });
    return bounds ? cardFoilRegions(bounds, dw, dh) : null;
  } catch {
    return null;
  }
}

// Per-region brightness/colour stats used to classify the card's foil: the
// name plate across the top, the artwork box, and the whole card (for rainbow
// foil that spans it). Regions come from the detected card box when available;
// the fixed screen fractions remain as the framing-guide fallback.
function readFoilStats(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  regions?: FoilRegions | null
): FoilStats {
  const region = (x0: number, y0: number, x1: number, y1: number): RegionStat =>
    regionStat(ctx, Math.round(x0 * w), Math.round(y0 * h), Math.round((x1 - x0) * w), Math.round((y1 - y0) * h));
  if (regions) {
    return {
      name: region(regions.name.x0, regions.name.y0, regions.name.x1, regions.name.y1),
      art: region(regions.art.x0, regions.art.y0, regions.art.x1, regions.art.y1),
      whole: region(regions.whole.x0, regions.whole.y0, regions.whole.x1, regions.whole.y1),
    };
  }
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
  // itself was identified (passcode or name).
  const setCode = extractSetCode(rawLines);
  const edition = detectEdition(rawLines);

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
      };
    }
  }

  const candidates = await getNameCandidates();
  const matches = matchOcrLines(rawLines, candidates, { limit: 6, minScore: 0.55 });
  return { matches, rawLines, setCode, edition, foil };
}
