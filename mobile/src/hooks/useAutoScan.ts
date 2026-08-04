import { useCallback, useEffect, useRef, useState } from "react";
import type { Agreement, FoilClass } from "@shared/scan/rarityVision";
import type { RarityCandidate } from "@shared/scan/rarityPrior";
import { db } from "../db";
import { addOwned, addPrintingCopy, refilePrintingCopy } from "../services/collection";
import { applyScannedPrinting } from "../services/printings";
import { buzz } from "../lib/haptics";
import { formatUsd } from "../lib/util";
import { toast } from "../components/Toaster";
import {
  captureFrameAndMatch,
  flipCamera,
  getZoomState,
  refocusCamera,
  setScreenAwake,
  setTorch as setTorchNative,
  setZoomLevel,
  startPreview,
  stopPreview,
  type ZoomState,
} from "../services/scanner";
import { DEFAULT_SCAN_SETTINGS, type ScanSettings } from "./useScanSettings";

export interface ScannedEntry {
  id: number;
  name: string;
  img: string | null;
  count: number; // copies added this session
  code?: string; // set code of the printing filed, when resolved
  rarity?: string; // inferred from the set code, once resolved
  edition?: string; // "1st Edition" / "Limited Edition", when read
  agreement?: Agreement; // whether the visual foil pass backed the set code
  ambiguous?: boolean; // rarity is a best guess among several the code allows
  candidates?: RarityCandidate[]; // every rarity the code could be, prior-ranked
}

// Everything read off the frame the card was committed from, for resolving the
// copy's printing/rarity after the fact.
interface CardMarks {
  setCode?: string | null;
  edition?: string;
  foil?: FoilClass;
  modelRarity?: string | null;
}

// Auto-add when a single frame is this confident, or when a slightly lower
// match repeats across two consecutive frames (reduces false positives).
const STRONG_SCORE = 0.9;
const AUTO_SCORE = 0.72;

// Short confirmation beep via Web Audio (no plugin) so a mounted phone can be
// used hands-free without watching the screen.
let audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch {
    // Audio not available — silent fallback.
  }
}

export interface AutoScanState {
  scanning: boolean;
  status: string;
  session: ScannedEntry[];
  torch: boolean;
  flash: { name: string; count: number } | null;
  zoom: ZoomState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggleTorch: () => Promise<void>;
  setZoom: (level: number) => Promise<void>;
  flip: () => Promise<void>;
  refocus: () => Promise<void>;
  captureNow: () => Promise<void>;
  undoLast: () => Promise<void>;
  // Idle the loop (no captures / torch pulses) while a sheet is open over it.
  setPaused: (paused: boolean) => void;
  // User picked the true rarity for a session entry — re-file its copies.
  resolveRarity: (entry: ScannedEntry, rarity: RarityCandidate) => Promise<void>;
}

export function useAutoScan(settings: ScanSettings = DEFAULT_SCAN_SETTINGS): AutoScanState {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Point the camera at a card");
  const [session, setSession] = useState<ScannedEntry[]>([]);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<{ name: string; count: number } | null>(null);
  const [zoom, setZoomState] = useState<ZoomState>({
    supported: false,
    min: 1,
    max: 1,
    current: 1,
    buttons: [],
  });

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const pendingIdRef = useRef<number | null>(null); // top match from previous frame
  const lockedIdRef = useRef<number | null>(null); // added; wait until it leaves frame
  // Commit order for undo. Each entry later learns which printing was filed
  // for it, so undo can remove that exact printing (not just any copy).
  const orderRef = useRef<
    { id: number; printing?: { code?: string; rarity?: string; edition?: string } }[]
  >([]);
  const torchWantedRef = useRef(false); // 🔦 toggle state, readable inside the loop
  const pausedRef = useRef(false); // picker open — keep the loop alive but idle

  // Keep the latest settings in a ref so the async scan loop reads current
  // values (delay/beep) without needing to be re-created on every change.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Apply keep-awake changes made mid-session immediately.
  useEffect(() => {
    if (scanning) void setScreenAwake(settings.keepAwake);
  }, [settings.keepAwake, scanning]);

  // Merges resolved printing/rarity/edition into a session entry once the
  // (async) lookup returns — the card was already added.
  const tagSession = useCallback(
    (
      id: number,
      tag: {
        code?: string;
        rarity?: string;
        edition?: string;
        agreement?: Agreement;
        ambiguous?: boolean;
        candidates?: RarityCandidate[];
      }
    ) => {
      if (!tag.rarity && !tag.edition) return;
      setSession((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                code: tag.code ?? e.code,
                rarity: tag.rarity ?? e.rarity,
                edition: tag.edition ?? e.edition,
                agreement: tag.agreement,
                ambiguous: tag.ambiguous,
                candidates: tag.candidates ?? e.candidates,
              }
            : e
        )
      );
    },
    []
  );

  const commit = useCallback(
    async (id: number, name: string, byPasscode = false, marks?: CardMarks) => {
      const nextCount = await addOwned(id, 1);
      const card = await db.cards.get(id);
      const order: (typeof orderRef.current)[number] = { id };
      orderRef.current.push(order);
      setSession((prev) => {
        const existing = prev.find((e) => e.id === id);
        const entry: ScannedEntry = {
          id,
          name,
          img: card?.img ?? null,
          count: (existing?.count ?? 0) + 1,
          edition: marks?.edition ?? existing?.edition,
          rarity: existing?.rarity,
        };
        return [entry, ...prev.filter((e) => e.id !== id)];
      });
      if (settingsRef.current.beepOnAdd) playBeep();
      if (settingsRef.current.hapticOnAdd) buzz();
      setFlash({ name, count: nextCount });
      setStatus(byPasscode ? `Added ${name} (card №)` : `Added ${name}`);
      setTimeout(() => setFlash(null), 900);

      // Resolve the printing (rarity) in the background — the lookup shouldn't
      // hold up the scan loop.
      if (settingsRef.current.detectPrinting && (marks?.setCode || marks?.edition)) {
        applyScannedPrinting(id, marks.setCode ?? null, marks.edition, {
          foil: marks.foil,
          modelRarity: marks.modelRarity,
        })
          .then((resolved) => {
            // Remember what was filed for this commit so undo removes exactly it.
            if (resolved.rarity !== undefined || resolved.edition !== undefined) {
              order.printing = {
                code: resolved.code,
                rarity: resolved.rarity,
                edition: resolved.edition,
              };
            }
            tagSession(id, resolved);
          })
          .catch(() => {});
      }
    },
    [tagSession]
  );

  // In pulse mode the torch only fires around a read: on, a short settle for
  // exposure, capture, off. Cuts the constant glare of a continuous torch.
  const withPulse = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    const pulse = torchWantedRef.current && settingsRef.current.flashMode === "pulse";
    if (pulse) {
      await setTorchNative(true);
      await new Promise((r) => setTimeout(r, 250));
    }
    try {
      return await work();
    } finally {
      if (pulse) await setTorchNative(false);
    }
  }, []);

  const tick = useCallback(async () => {
    if (!runningRef.current || busyRef.current) return;
    // Paused (rarity picker open): skip the capture but keep rescheduling so
    // the loop resumes the moment the sheet closes.
    if (pausedRef.current) {
      timerRef.current = setTimeout(tick, settingsRef.current.scanDelayMs);
      return;
    }
    busyRef.current = true;
    try {
      const { matches, matchedByPasscode, setCode, edition, foil, modelRarity } =
        await withPulse(captureFrameAndMatch);
      const top = matches[0];

      if (!top || top.score < AUTO_SCORE) {
        // No confident card in frame — clear the lock so a previously-added
        // card can be scanned again once it's shown a second time.
        lockedIdRef.current = null;
        pendingIdRef.current = null;
        if (runningRef.current) setStatus("Point the camera at a card");
      } else if (top.id === lockedIdRef.current) {
        // Same card still in view — don't re-add until it leaves.
        setStatus(`${top.name} — move it away to scan another`);
      } else {
        // A passcode hit is an exact id match — commit it immediately.
        const stable = pendingIdRef.current === top.id;
        if (matchedByPasscode || top.score >= STRONG_SCORE || stable) {
          lockedIdRef.current = top.id;
          pendingIdRef.current = null;
          await commit(top.id, top.name, matchedByPasscode, { setCode, edition, foil, modelRarity });
        } else {
          pendingIdRef.current = top.id;
          setStatus(`Reading ${top.name}…`);
        }
      }
    } catch {
      // Transient capture/OCR errors — keep looping.
    } finally {
      busyRef.current = false;
      if (runningRef.current) {
        timerRef.current = setTimeout(tick, settingsRef.current.scanDelayMs);
      }
    }
  }, [commit, withPulse]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    // Fresh session each time, so the end-of-session recap counts only this run.
    orderRef.current = [];
    setSession([]);
    await startPreview();
    // Phone is typically in a mount for a scan session — keep the screen from
    // dimming/locking so it doesn't cut the session short (unless disabled).
    if (settingsRef.current.keepAwake) await setScreenAwake(true);
    // Restore the last-used zoom ratio, then read back what the camera has.
    if (settingsRef.current.zoomRatio !== 1) {
      await setZoomLevel(settingsRef.current.zoomRatio);
    }
    setZoomState(await getZoomState());
    runningRef.current = true;
    setScanning(true);
    setStatus("Point the camera at a card");
    timerRef.current = setTimeout(tick, settingsRef.current.scanDelayMs);
  }, [tick]);

  const stop = useCallback(async () => {
    runningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (torchWantedRef.current) {
      torchWantedRef.current = false;
      await setTorchNative(false);
      setTorch(false);
    }
    await setScreenAwake(false);
    await stopPreview();
    setScanning(false);
    // End-of-session recap: how many cards and roughly how much value added.
    const ids = orderRef.current.map((o) => o.id);
    if (ids.length > 0) {
      const cards = await db.cards.bulkGet(ids);
      const value = cards.reduce((sum, c) => sum + (c?.price ?? 0), 0);
      toast(
        `Session: ${ids.length} card${ids.length === 1 ? "" : "s"} added · ~${formatUsd(value)}`,
        "success"
      );
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const next = !torchWantedRef.current;
    torchWantedRef.current = next;
    setTorch(next);
    // Continuous mode drives the light directly; pulse mode leaves it off and
    // lets the scan loop fire it around each read.
    if (settingsRef.current.flashMode === "pulse") {
      if (!next) await setTorchNative(false);
    } else {
      await setTorchNative(next);
    }
  }, []);

  const setZoom = useCallback(async (level: number) => {
    setZoomState((z) => ({ ...z, current: level })); // optimistic — slider stays smooth
    await setZoomLevel(level);
  }, []);

  const flip = useCallback(async () => {
    await flipCamera();
    // The new camera starts with fresh params — re-apply torch (continuous
    // mode only) and zoom, then refresh what this camera supports.
    if (torchWantedRef.current && settingsRef.current.flashMode === "continuous") {
      await setTorchNative(true);
    }
    const ratio = settingsRef.current.zoomRatio;
    if (ratio !== 1) await setZoomLevel(ratio);
    setZoomState(await getZoomState());
  }, []);

  const refocus = useCallback(async () => {
    await refocusCamera();
    setStatus("Refocusing…");
    setTimeout(() => {
      if (runningRef.current) setStatus("Point the camera at a card");
    }, 700);
  }, []);

  // Force-add the current top match, bypassing the stability/lock gates.
  const captureNow = useCallback(async () => {
    if (!runningRef.current) return;
    try {
      const { matches, matchedByPasscode, setCode, edition, foil, modelRarity } =
        await withPulse(captureFrameAndMatch);
      const top = matches[0];
      if (top) {
        lockedIdRef.current = top.id;
        await commit(top.id, top.name, matchedByPasscode, { setCode, edition, foil, modelRarity });
      } else {
        setStatus("No card recognised — try again");
      }
    } catch {
      setStatus("Capture failed — try again");
    }
  }, [commit, withPulse]);

  const undoLast = useCallback(async () => {
    const last = orderRef.current.pop();
    if (last == null) return;
    const id = last.id;
    // Remove the exact printing this commit filed *before* dropping the
    // quantity — the drop's reconcile would otherwise trim some other row.
    if (last.printing) await addPrintingCopy(id, last.printing, -1);
    await addOwned(id, -1);
    setSession((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (!entry) return prev;
      if (entry.count <= 1) return prev.filter((e) => e.id !== id);
      return prev.map((e) => (e.id === id ? { ...e, count: e.count - 1 } : e));
    });
    if (lockedIdRef.current === id) lockedIdRef.current = null;
    setStatus("Removed last card");
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
  }, []);

  // The user told us which rarity the scanned copies really are: move this
  // session entry's copies from the guessed row to the chosen one, mark the
  // session chip confirmed, and repoint pending undos at the new row.
  const resolveRarity = useCallback(async (entry: ScannedEntry, rarity: RarityCandidate) => {
    const from = { code: entry.code, rarity: entry.rarity, edition: entry.edition };
    const to = { code: rarity.code, rarity: rarity.rarity, edition: entry.edition };
    await refilePrintingCopy(entry.id, from, to, entry.count);
    for (const o of orderRef.current) {
      if (
        o.id === entry.id &&
        o.printing &&
        (o.printing.code ?? "") === (from.code ?? "") &&
        (o.printing.rarity ?? "") === (from.rarity ?? "")
      ) {
        o.printing = to;
      }
    }
    setSession((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? { ...e, code: rarity.code, rarity: rarity.rarity, agreement: "confirmed", ambiguous: false }
          : e
      )
    );
  }, []);

  // Ensure the camera is released and the screen can sleep again if the page
  // unmounts mid-scan.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      void stopPreview();
      void setScreenAwake(false);
    };
  }, []);

  return {
    scanning,
    status,
    session,
    torch,
    flash,
    zoom,
    start,
    stop,
    toggleTorch,
    setZoom,
    flip,
    refocus,
    captureNow,
    undoLast,
    setPaused,
    resolveRarity,
  };
}
