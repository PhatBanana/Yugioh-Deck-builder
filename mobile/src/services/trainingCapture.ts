import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Zip, ZipPassThrough } from "fflate";
import {
  CAPTURE_CAP_BYTES,
  foilFamilyFor,
  planEviction,
  type CaptureSource,
} from "@shared/scan/trainingCapture";
import { detectCardBounds } from "@shared/grading/analyze";
import { db, type MTrainingMeta } from "../db";

// Training-data capture (see docs/adr/0001 + CONTEXT.md): saves a full-res
// card crop + trusted label at the moment the label becomes known, on-device
// only, oldest-out under a 1 GiB cap, exported manually as a zip. Trusted
// labels come from exactly two moments: an unambiguous rarity-index hit at
// commit, or the user confirming in the rarity picker. The picker case needs
// the pixels stashed at commit time (the frame is long gone by confirm), so
// ambiguous commits park a pending crop here until confirmed or the session
// ends.

// ---- Card crop --------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

// Crops the raw frame to the detected card bounding box at full capture
// resolution (bounds are found on a small downscale — same approach as the
// scan loop's region tracking — then scaled back up). Null when no plausible
// card box is found: no card crop, no example (the abstain-not-garbage rule).
export async function cropCardFromFrame(frameDataUrl: string): Promise<Blob | null> {
  try {
    const img = await loadImage(frameDataUrl);
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
    if (!bounds) return null;
    const fx = img.width / dw;
    const fy = img.height / dh;
    const x = Math.max(0, Math.round(bounds.left * fx));
    const y = Math.max(0, Math.round(bounds.top * fy));
    const w = Math.min(img.width - x, Math.round((bounds.right - bounds.left) * fx));
    const h = Math.min(img.height - y, Math.round((bounds.bottom - bounds.top) * fy));
    if (w < 60 || h < 60) return null;
    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const ctx = crop.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    return await canvasToJpeg(crop);
  } catch {
    return null;
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

// ---- Storing examples --------------------------------------------------

export interface TorchFramePair {
  off: string; // torch-off frame data URL
  on: string; // torch-on frame data URL
}

interface StoreOpts {
  cardId: number;
  setCode: string | null;
  rarity: string;
  source: CaptureSource;
  edition?: string;
  jpeg: Blob;
  pairOff?: Blob;
  pairOn?: Blob;
}

async function storeExample(opts: StoreOpts): Promise<void> {
  const family = foilFamilyFor(opts.rarity);
  if (!family) return; // variable-finish rarity — no trusted family, no label
  const bytes = opts.jpeg.size + (opts.pairOff?.size ?? 0) + (opts.pairOn?.size ?? 0);
  await db.transaction("rw", db.trainingMeta, db.trainingBlobs, async () => {
    const stored = (await db.trainingMeta.toArray()).map((m) => ({
      id: m.id!,
      at: m.at,
      bytes: m.bytes,
    }));
    const evict = planEviction(stored, bytes, CAPTURE_CAP_BYTES);
    if (evict.length > 0) {
      await db.trainingMeta.bulkDelete(evict);
      await db.trainingBlobs.bulkDelete(evict);
    }
    const meta: MTrainingMeta = {
      at: new Date().toISOString(),
      cardId: opts.cardId,
      setCode: opts.setCode,
      rarity: opts.rarity,
      family,
      source: opts.source,
      edition: opts.edition,
      torch: opts.pairOff != null && opts.pairOn != null,
      bytes,
      device: navigator.userAgent,
    };
    const id = (await db.trainingMeta.add(meta)) as number;
    await db.trainingBlobs.put({ id, jpeg: opts.jpeg, pairOff: opts.pairOff, pairOn: opts.pairOn });
  });
}

// Captures an example whose label is already trusted (unambiguous index hit
// at commit). Silently does nothing when no card box is found in the frame.
export async function captureTrusted(opts: {
  cardId: number;
  setCode: string | null;
  rarity: string;
  edition?: string;
  frame: string; // raw full-res frame data URL
  torchFrames?: TorchFramePair;
}): Promise<void> {
  try {
    if (foilFamilyFor(opts.rarity) == null) return; // skip the crop work too
    const jpeg = await cropCardFromFrame(opts.frame);
    if (!jpeg) return;
    const [pairOff, pairOn] = opts.torchFrames
      ? await Promise.all([
          dataUrlToBlob(opts.torchFrames.off),
          dataUrlToBlob(opts.torchFrames.on),
        ])
      : [undefined, undefined];
    await storeExample({ ...opts, source: "unambiguous-index", jpeg, pairOff, pairOn });
  } catch {
    // Capture is strictly best-effort — never let it disturb a scan.
  }
}

// ---- Pending captures (ambiguous commits awaiting a picker confirm) -----

interface PendingCapture {
  setCode: string | null;
  edition?: string;
  jpeg: Blob;
  pairOff?: Blob;
  pairOn?: Blob;
}

// Session-scoped: pixels never outlive the scan session unconfirmed. Bounded
// FIFO so a marathon session of ambiguous cards can't hoard memory.
const PENDING_MAX = 40;
const pending = new Map<number, PendingCapture>();

// Crops and parks the frame of an ambiguous commit, keyed by card id, so a
// later picker confirmation can turn it into a trusted example.
export async function stashPendingCapture(
  cardId: number,
  opts: { setCode: string | null; edition?: string; frame: string; torchFrames?: TorchFramePair }
): Promise<void> {
  try {
    const jpeg = await cropCardFromFrame(opts.frame);
    if (!jpeg) return;
    const [pairOff, pairOn] = opts.torchFrames
      ? await Promise.all([
          dataUrlToBlob(opts.torchFrames.off),
          dataUrlToBlob(opts.torchFrames.on),
        ])
      : [undefined, undefined];
    pending.delete(cardId); // re-insert → freshest frame wins and moves to the back
    pending.set(cardId, { setCode: opts.setCode, edition: opts.edition, jpeg, pairOff, pairOn });
    if (pending.size > PENDING_MAX) {
      const oldest = pending.keys().next().value;
      if (oldest !== undefined) pending.delete(oldest);
    }
  } catch {
    // Best-effort.
  }
}

// The user confirmed this session entry's true rarity — promote its parked
// crop into the training set. No-op when nothing was parked (picker opened
// on an entry scanned before capture was on, frame had no card box, …).
export async function promotePendingCapture(cardId: number, rarity: string): Promise<void> {
  const parked = pending.get(cardId);
  if (!parked) return;
  pending.delete(cardId);
  try {
    await storeExample({
      cardId,
      setCode: parked.setCode,
      rarity,
      source: "picker-confirm",
      edition: parked.edition,
      jpeg: parked.jpeg,
      pairOff: parked.pairOff,
      pairOn: parked.pairOn,
    });
  } catch {
    // Best-effort.
  }
}

// A removed/undone session entry's parked frame must not become an example.
export function dropPendingCapture(cardId: number): void {
  pending.delete(cardId);
}

// Session over — unconfirmed frames are dropped, by design.
export function clearPendingCaptures(): void {
  pending.clear();
}

// ---- Stats / clear ------------------------------------------------------

export interface TrainingStats {
  count: number;
  bytes: number;
}

export async function trainingStats(): Promise<TrainingStats> {
  const metas = await db.trainingMeta.toArray();
  return { count: metas.length, bytes: metas.reduce((sum, m) => sum + m.bytes, 0) };
}

export async function clearTrainingData(): Promise<void> {
  await db.transaction("rw", db.trainingMeta, db.trainingBlobs, async () => {
    await db.trainingMeta.clear();
    await db.trainingBlobs.clear();
  });
}

// ---- Export -------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// Streams the whole training set into a zip and hands it to the share sheet.
// JPEGs are stored uncompressed (they don't deflate) via ZipPassThrough, and
// the zip is flushed to a cache file in batches so a near-cap dataset never
// has to fit in memory. Layout: NNNNNN.jpg (card crop), NNNNNN.torch-off.jpg /
// NNNNNN.torch-on.jpg (full frames, when the torch pass ran), manifest.jsonl
// (one JSON line per example).
export async function exportTrainingZip(): Promise<"shared" | "empty" | "failed"> {
  try {
    const metas = await db.trainingMeta.orderBy("id").toArray();
    if (metas.length === 0) return "empty";

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const path = `ygo-training-${stamp}.zip`;
    const native = Capacitor.isNativePlatform();
    if (native) {
      await Filesystem.writeFile({ path, data: "", directory: Directory.Cache });
    }

    // Buffered sink: fflate emits synchronously, the file write is async.
    const webChunks: Uint8Array[] = [];
    let buffer: Uint8Array[] = [];
    let buffered = 0;
    let zipError: Error | null = null;
    const flush = async () => {
      if (buffer.length === 0) return;
      const parts = buffer;
      buffer = [];
      buffered = 0;
      if (native) {
        const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) {
          joined.set(p, o);
          o += p.length;
        }
        await Filesystem.appendFile({ path, data: toBase64(joined), directory: Directory.Cache });
      } else {
        webChunks.push(...parts);
      }
    };

    const zip = new Zip((err, dat) => {
      if (err) zipError = err;
      else if (dat.length > 0) {
        buffer.push(dat);
        buffered += dat.length;
      }
    });
    const addFile = async (name: string, blob: Blob) => {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(new Uint8Array(await blob.arrayBuffer()), true);
      if (zipError) throw zipError;
      if (buffered >= 4 * 1024 * 1024) await flush();
    };

    const manifest: string[] = [];
    for (const meta of metas) {
      const blob = await db.trainingBlobs.get(meta.id!);
      if (!blob) continue;
      const base = String(meta.id).padStart(6, "0");
      await addFile(`${base}.jpg`, blob.jpeg);
      if (blob.pairOff) await addFile(`${base}.torch-off.jpg`, blob.pairOff);
      if (blob.pairOn) await addFile(`${base}.torch-on.jpg`, blob.pairOn);
      manifest.push(
        JSON.stringify({
          file: `${base}.jpg`,
          pair_off: blob.pairOff ? `${base}.torch-off.jpg` : undefined,
          pair_on: blob.pairOn ? `${base}.torch-on.jpg` : undefined,
          at: meta.at,
          card_id: meta.cardId,
          set_code: meta.setCode,
          rarity: meta.rarity,
          family: meta.family,
          source: meta.source,
          edition: meta.edition,
          device: meta.device,
        })
      );
    }
    await addFile("manifest.jsonl", new Blob([manifest.join("\n") + "\n"]));
    zip.end();
    if (zipError) throw zipError;
    await flush();

    if (native) {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: path, url: uri, dialogTitle: `Share ${path}` });
    } else {
      const url = URL.createObjectURL(new Blob(webChunks as BlobPart[], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = path;
      a.click();
      URL.revokeObjectURL(url);
    }
    return "shared";
  } catch (err) {
    // Dismissing the share sheet isn't a failure.
    if (err instanceof Error && /cancel/i.test(err.message)) return "shared";
    return "failed";
  }
}
