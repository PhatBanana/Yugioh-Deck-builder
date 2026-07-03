import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../db";
import { addOwned } from "../services/collection";
import {
  captureFrameAndMatch,
  setTorch as setTorchNative,
  startPreview,
  stopPreview,
} from "../services/scanner";

export interface ScannedEntry {
  id: number;
  name: string;
  img: string | null;
  count: number; // copies added this session
}

// Frame cadence — OCR is heavy, so leave room between passes.
const POLL_MS = 850;
// Auto-add when a single frame is this confident, or when a slightly lower
// match repeats across two consecutive frames (reduces false positives).
const STRONG_SCORE = 0.9;
const AUTO_SCORE = 0.72;

export interface AutoScanState {
  scanning: boolean;
  status: string;
  session: ScannedEntry[];
  torch: boolean;
  flash: { name: string; count: number } | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggleTorch: () => Promise<void>;
  captureNow: () => Promise<void>;
  undoLast: () => Promise<void>;
}

export function useAutoScan(): AutoScanState {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Point the camera at a card");
  const [session, setSession] = useState<ScannedEntry[]>([]);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<{ name: string; count: number } | null>(null);

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const pendingIdRef = useRef<number | null>(null); // top match from previous frame
  const lockedIdRef = useRef<number | null>(null); // added; wait until it leaves frame
  const orderRef = useRef<number[]>([]); // commit order, for undo

  const commit = useCallback(async (id: number, name: string) => {
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
    setFlash({ name, count: nextCount });
    setStatus(`Added ${name}`);
    setTimeout(() => setFlash(null), 900);
  }, []);

  const tick = useCallback(async () => {
    if (!runningRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      const { matches } = await captureFrameAndMatch();
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
        const stable = pendingIdRef.current === top.id;
        if (top.score >= STRONG_SCORE || stable) {
          lockedIdRef.current = top.id;
          pendingIdRef.current = null;
          await commit(top.id, top.name);
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
        timerRef.current = setTimeout(tick, POLL_MS);
      }
    }
  }, [commit]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    await startPreview();
    runningRef.current = true;
    setScanning(true);
    setStatus("Point the camera at a card");
    timerRef.current = setTimeout(tick, POLL_MS);
  }, [tick]);

  const stop = useCallback(async () => {
    runningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (torch) {
      await setTorchNative(false);
      setTorch(false);
    }
    await stopPreview();
    setScanning(false);
  }, [torch]);

  const toggleTorch = useCallback(async () => {
    const next = !torch;
    setTorch(next);
    await setTorchNative(next);
  }, [torch]);

  // Force-add the current top match, bypassing the stability/lock gates.
  const captureNow = useCallback(async () => {
    if (!runningRef.current) return;
    try {
      const { matches } = await captureFrameAndMatch();
      const top = matches[0];
      if (top) {
        lockedIdRef.current = top.id;
        await commit(top.id, top.name);
      } else {
        setStatus("No card recognised — try again");
      }
    } catch {
      setStatus("Capture failed — try again");
    }
  }, [commit]);

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

  // Ensure the camera is released if the page unmounts mid-scan.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      void stopPreview();
    };
  }, []);

  return {
    scanning,
    status,
    session,
    torch,
    flash,
    start,
    stop,
    toggleTorch,
    captureNow,
    undoLast,
  };
}
