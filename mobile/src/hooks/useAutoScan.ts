import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../db";
import { addOwned } from "../services/collection";
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
}

export function useAutoScan(settings: ScanSettings = DEFAULT_SCAN_SETTINGS): AutoScanState {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Point the camera at a card");
  const [session, setSession] = useState<ScannedEntry[]>([]);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<{ name: string; count: number } | null>(null);
  const [zoom, setZoomState] = useState<ZoomState>({ supported: false, max: 0, current: 0 });

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const pendingIdRef = useRef<number | null>(null); // top match from previous frame
  const lockedIdRef = useRef<number | null>(null); // added; wait until it leaves frame
  const orderRef = useRef<number[]>([]); // commit order, for undo
  const torchWantedRef = useRef(false); // 🔦 toggle state, readable inside the loop

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

  const commit = useCallback(
    async (id: number, name: string, byPasscode = false) => {
      const nextCount = await addOwned(id, 1);
      const card = await db.cards.get(id);
      orderRef.current.push(id);
      setSession((prev) => {
        const existing = prev.find((e) => e.id === id);
        const entry: ScannedEntry = {
          id,
          name,
          img: card?.img ?? null,
          count: (existing?.count ?? 0) + 1,
        };
        return [entry, ...prev.filter((e) => e.id !== id)];
      });
      if (settingsRef.current.beepOnAdd) playBeep();
      setFlash({ name, count: nextCount });
      setStatus(byPasscode ? `Added ${name} (card №)` : `Added ${name}`);
      setTimeout(() => setFlash(null), 900);
    },
    []
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
    busyRef.current = true;
    try {
      const { matches, matchedByPasscode } = await withPulse(captureFrameAndMatch);
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
          await commit(top.id, top.name, matchedByPasscode);
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
    await startPreview();
    // Phone is typically in a mount for a scan session — keep the screen from
    // dimming/locking so it doesn't cut the session short (unless disabled).
    if (settingsRef.current.keepAwake) await setScreenAwake(true);
    // Restore the last-used zoom, then read back what the camera actually has.
    if (settingsRef.current.zoomLevel > 0) {
      await setZoomLevel(settingsRef.current.zoomLevel);
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
    const level = settingsRef.current.zoomLevel;
    if (level > 0) await setZoomLevel(level);
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
      const { matches, matchedByPasscode } = await withPulse(captureFrameAndMatch);
      const top = matches[0];
      if (top) {
        lockedIdRef.current = top.id;
        await commit(top.id, top.name, matchedByPasscode);
      } else {
        setStatus("No card recognised — try again");
      }
    } catch {
      setStatus("Capture failed — try again");
    }
  }, [commit, withPulse]);

  const undoLast = useCallback(async () => {
    const id = orderRef.current.pop();
    if (id == null) return;
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
  };
}
