import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { NameMatch } from "@shared/scan/nameMatcher";
import { matchCardName } from "@shared/scan/nameMatcher";
import { rarityAbbrev } from "@shared/scan/setCode";
import { foilClass } from "../lib/foil";
import { db } from "../db";
import { formatUsd } from "../lib/util";
import { addOwned } from "../services/collection";
import { getNameCandidates, isScanSupported } from "../services/scanner";
import { useAutoScan, type AutoScanState, type ScannedEntry } from "../hooks/useAutoScan";
import RarityPickSheet from "../components/RarityPickSheet";
import SessionReviewSheet from "../components/SessionReviewSheet";
import TorchFoilLab from "../components/TorchFoilLab";
import { useScanSettings } from "../hooks/useScanSettings";
import ScanSettingsSheet from "../components/ScanSettingsSheet";
import SyncFirstNotice from "../components/SyncFirstNotice";
import PasteImport from "../components/PasteImport";
import DeckImport from "../components/DeckImport";
import { useBackClose } from "../hooks/useBackClose";
import { usePersistentState } from "../hooks/usePersistentState";
import CardThumb from "../components/CardThumb";
import { useCardDetail } from "../components/CardDetailModal";
import { toast } from "../components/Toaster";

function ManualMatchRow({ match }: { match: NameMatch }) {
  const card = useLiveQuery(() => db.cards.get(match.id), [match.id]);
  const owned = useLiveQuery(
    async () => (await db.collection.get(match.id))?.quantity ?? 0,
    [match.id]
  );
  const openCard = useCardDetail();
  async function add() {
    const next = await addOwned(match.id, 1);
    toast(`${match.name} — now own ${next}`, "success");
  }
  return (
    <div className="flex items-center gap-3 panel p-2.5">
      <button
        type="button"
        onClick={() => openCard(match.id)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <CardThumb img={card?.img} w="w-12" h="h-[70px]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{match.name}</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {owned ? `own ${owned}` : "not owned"}
            {card?.price != null ? ` · ${formatUsd(card.price)}` : ""}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={add}
        className="btn-primary shrink-0 px-4 py-2.5 rounded-lg text-sm"
      >
        +1
      </button>
    </div>
  );
}

// Steps the zoom ratio by a quarter, snapping to a clean 0.25 grid (1.25×,
// 1.50×, …) and clamped to the lens's range — finer than the lens buttons.
function nudgeZoom(zoom: { min: number; max: number; current: number }, delta: number): number {
  const base = Math.round(zoom.current / 0.25) * 0.25;
  const next = Number((base + delta).toFixed(2));
  return Math.min(zoom.max, Math.max(zoom.min, next));
}

function ScanningOverlay({
  scan,
  onOpenSettings,
  onZoom,
}: {
  scan: AutoScanState;
  onOpenSettings: () => void;
  onZoom: (level: number) => void;
}) {
  // Hardware back exits the fullscreen scan instead of minimizing the app.
  useBackClose(() => void scan.stop());
  const sessionTotal = scan.session.reduce((n, e) => n + e.count, 0);
  // Rarity picker for an unsure chip, and the full session review list —
  // scanning idles while either is open (the picker can stack on the review).
  const [pickFor, setPickFor] = useState<ScannedEntry | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const openPicker = (e: ScannedEntry) => {
    scan.setPaused(true);
    setPickFor(e);
  };
  const closePicker = () => {
    setPickFor(null);
    if (!reviewOpen) scan.setPaused(false);
  };
  const openReview = () => {
    scan.setPaused(true);
    setReviewOpen(true);
  };
  const closeReview = () => {
    setReviewOpen(false);
    scan.setPaused(false);
  };
  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          type="button"
          onClick={() => void scan.stop()}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-xl leading-none"
          aria-label="Stop scanning"
        >
          ×
        </button>
        <button
          type="button"
          onClick={openReview}
          disabled={sessionTotal === 0}
          className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur text-sm text-white disabled:opacity-60"
          aria-label="Review cards added this session"
        >
          {sessionTotal} added{sessionTotal > 0 ? " ›" : ""}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void scan.flip()}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-lg"
            aria-label="Switch camera"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-lg"
            aria-label="Scan settings"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={() => void scan.toggleTorch()}
            className={`w-10 h-10 rounded-full backdrop-blur text-lg ${
              scan.torch ? "bg-amber-400 text-black" : "bg-black/50 text-white"
            }`}
            aria-label="Toggle torch"
          >
            🔦
          </button>
        </div>
      </div>

      {/* Framing guide — tapping it re-triggers autofocus. */}
      <div
        className="flex-1 flex items-center justify-center px-8"
        onClick={() => void scan.refocus()}
        role="button"
        aria-label="Tap to refocus"
      >
        <div className="w-full max-w-xs aspect-[59/86] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none" />
      </div>

      {/* Zoom: quick lens buttons (0.5×/1×/2×/3× — real optical lenses on
          multi-camera phones) plus a fine ratio slider. */}
      {scan.zoom.supported && (
        <div className="flex flex-col gap-2 px-6 pb-1">
          {scan.zoom.buttons.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              {scan.zoom.buttons.map((v) => {
                const active = Math.abs(scan.zoom.current - v) < 0.15;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onZoom(v)}
                    className={`min-w-11 px-2.5 py-1 rounded-full text-sm font-semibold backdrop-blur ${
                      active ? "bg-amber-400 text-black" : "bg-black/50 text-white"
                    }`}
                  >
                    {v % 1 === 0 ? v : v.toFixed(1)}×
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onZoom(nudgeZoom(scan.zoom, -0.25))}
              disabled={scan.zoom.current <= scan.zoom.min}
              className="text-white/80 text-sm w-8 h-8 rounded-full bg-black/50 backdrop-blur disabled:opacity-30"
              aria-label="Zoom out a little"
            >
              🔍−
            </button>
            <input
              type="range"
              min={scan.zoom.min}
              max={scan.zoom.max}
              step={0.05}
              value={scan.zoom.current}
              onChange={(e) => onZoom(Number(e.target.value))}
              className="flex-1 accent-amber-400"
              aria-label="Camera zoom"
            />
            <button
              type="button"
              onClick={() => onZoom(nudgeZoom(scan.zoom, 0.25))}
              disabled={scan.zoom.current >= scan.zoom.max}
              className="text-white/80 text-sm w-8 h-8 rounded-full bg-black/50 backdrop-blur disabled:opacity-30"
              aria-label="Zoom in a little"
            >
              🔍＋
            </button>
          </div>
          <div className="text-center text-white/60 text-[11px] tabular-nums -mt-1">
            {scan.zoom.current.toFixed(2)}×
          </div>
        </div>
      )}

      {/* Status + flash */}
      <div className="text-center pb-2 min-h-6">
        {scan.flash ? (
          <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-medium">
            ✓ {scan.flash.name} ×{scan.flash.count}
          </span>
        ) : (
          <span className="inline-block px-4 py-1.5 rounded-full bg-black/50 backdrop-blur text-sm text-white/90">
            {scan.status}
          </span>
        )}
      </div>

      {/* Session strip */}
      {scan.session.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          {scan.session.map((e) => (
            <div key={e.id} className="shrink-0 w-12">
              <div className="relative">
                {e.img ? (
                  <span className="relative block">
                    <img src={e.img} alt={e.name} className="w-12 rounded" />
                    {foilClass(e.rarity) && (
                      <span aria-hidden className={`foil ${foilClass(e.rarity)}`} />
                    )}
                  </span>
                ) : (
                  <div className="w-12 h-[70px] rounded bg-neutral-700" />
                )}
                {e.count > 1 && (
                  <span className="pop-in absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center">
                    {e.count}
                  </span>
                )}
                {e.edition === "1st Edition" && (
                  <span className="absolute -bottom-1 -left-1 px-1 rounded bg-sky-500 text-white text-[9px] font-bold leading-tight">
                    1st
                  </span>
                )}
              </div>
              {e.rarity &&
                (() => {
                  // A chip needs checking when the rarity is a guess (several
                  // candidates, nothing confirmed it) or vision disagreed.
                  const unsure =
                    e.ambiguous || e.agreement === "conflict" || e.agreement === "unknown";
                  const canPick = unsure && (e.candidates?.length ?? 0) > 1;
                  const cls = `w-full text-center text-[9px] font-semibold mt-0.5 leading-tight tabular-nums ${
                    e.agreement === "conflict" ? "text-rose-400" : unsure ? "text-amber-300" : "text-amber-300/90"
                  }`;
                  const label = `${rarityAbbrev(e.rarity)}${unsure ? "?" : ""}`;
                  return canPick ? (
                    <button
                      type="button"
                      onClick={() => openPicker(e)}
                      className={`${cls} underline decoration-dotted underline-offset-2`}
                      aria-label={`Confirm rarity for ${e.name}`}
                    >
                      {label}
                    </button>
                  ) : (
                    <div className={cls}>{label}</div>
                  );
                })()}
            </div>
          ))}
        </div>
      )}

      {reviewOpen && (
        <SessionReviewSheet
          session={scan.session}
          onClose={closeReview}
          onRemove={(e) => void scan.removeOne(e)}
          onPickRarity={openPicker}
        />
      )}

      {pickFor && pickFor.candidates && (
        <RarityPickSheet
          cardName={pickFor.name}
          img={pickFor.img}
          candidates={pickFor.candidates}
          current={pickFor.rarity}
          foil={pickFor.foil}
          onPick={(c) => {
            void scan.resolveRarity(pickFor, c);
            closePicker();
          }}
          onClose={closePicker}
        />
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button
          type="button"
          onClick={() => void scan.undoLast()}
          disabled={scan.session.length === 0}
          className="px-4 py-3 rounded-xl bg-black/50 backdrop-blur text-white text-sm disabled:opacity-30"
        >
          ↩ Undo
        </button>
        <button
          type="button"
          onClick={() => void scan.captureNow()}
          className="w-16 h-16 rounded-full bg-white active:bg-neutral-300 ring-4 ring-white/30 border-2 border-black/20 transition-transform active:scale-95"
          aria-label="Capture now"
        />
        <button
          type="button"
          onClick={() => void scan.stop()}
          className="btn-primary px-4 py-3 text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// The three ways to get cards into the collection, all living on this tab.
type AddMode = "scan" | "paste" | "deck";

const ADD_MODES: { id: AddMode; label: string }[] = [
  { id: "scan", label: "📷 Scan" },
  { id: "paste", label: "📋 Paste list" },
  { id: "deck", label: "🔎 Find a deck" },
];

export default function ScanPage({
  onImmersive,
  onGoToCards,
}: {
  onImmersive: (v: boolean) => void;
  onGoToCards: () => void;
}) {
  const { settings, update } = useScanSettings();
  const scan = useAutoScan(settings);
  const cardCount = useLiveQuery(() => db.cards.count());
  const [mode, setMode] = usePersistentState<AddMode>("ygo-add-mode", "scan");
  const [manualQuery, setManualQuery] = useState("");
  const [manualMatches, setManualMatches] = useState<NameMatch[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  const settingsSheet = settingsOpen ? (
    <ScanSettingsSheet settings={settings} update={update} onClose={() => setSettingsOpen(false)} />
  ) : null;

  // Both the scan overlay and the foil lab are fullscreen camera views: hide
  // the app chrome, and toggle the <html> class that makes html/body/#root
  // transparent so the behind-the-webview preview shows through. One owner
  // for the class — the lab starts/stops its own preview but never touches
  // the class, so there's no second writer to race with.
  const cameraView = scan.scanning || labOpen;
  useEffect(() => {
    onImmersive(cameraView);
    const root = document.documentElement;
    if (cameraView) root.classList.add("camera-scanning");
    else root.classList.remove("camera-scanning");
    return () => root.classList.remove("camera-scanning");
  }, [cameraView, onImmersive]);

  async function manualSearch(q: string) {
    setManualQuery(q);
    if (q.trim().length < 3) {
      setManualMatches([]);
      return;
    }
    const candidates = await getNameCandidates();
    setManualMatches(matchCardName(q, candidates, { limit: 6, minScore: 0.4 }));
  }

  async function startScan() {
    try {
      await scan.start();
    } catch (err) {
      toast(`Couldn't start camera: ${err instanceof Error ? err.message : err}`, "error");
    }
  }

  if (!cardCount) {
    return (
      <SyncFirstNotice
        reason="scanning matches photos against it."
        onGoToCards={onGoToCards}
      />
    );
  }

  if (labOpen) return <TorchFoilLab onClose={() => setLabOpen(false)} />;

  if (scan.scanning)
    return (
      <>
        <ScanningOverlay
          scan={scan}
          onOpenSettings={() => setSettingsOpen(true)}
          onZoom={(level) => {
            void scan.setZoom(level);
            update({ zoomRatio: level }); // remember for the next session
          }}
        />
        {settingsSheet}
      </>
    );

  return (
    <div className="page p-4 flex flex-col gap-4">
      {/* One tab, three ways in: camera, pasted list, or a whole deck. */}
      <div className="seg text-xs">
        {ADD_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`seg-btn py-2 ${mode === m.id ? "seg-on" : ""}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "paste" && <PasteImport />}
      {mode === "deck" && <DeckImport />}

      {mode === "scan" && (
        <>
          <div className="flex justify-end gap-1 -mb-2 -mt-1">
            {/* The lab drives the camera itself, so it belongs beside Scan
                rather than buried in settings. */}
            <button
              type="button"
              disabled={!isScanSupported()}
              onClick={() => setLabOpen(true)}
              className="text-sm text-neutral-400 active:text-white px-2 py-1 disabled:opacity-40"
            >
              🔦 Foil lab
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-sm text-neutral-400 active:text-white px-2 py-1"
            >
              ⚙ Settings
            </button>
          </div>
          <button
            type="button"
            disabled={!isScanSupported()}
            onClick={startScan}
            className="btn-primary w-full py-5 rounded-2xl text-lg"
          >
            📷 Scan cards
          </button>
          <p className="text-xs text-neutral-500 text-center -mt-2">
            {isScanSupported()
              ? "Hold each card up — it captures automatically when the name is readable. Show the next card to keep going."
              : "Live camera scanning works in the Android app. Use the search below in the browser."}
          </p>

          <div className="mt-1">
            <input
              type="search"
              value={manualQuery}
              onChange={(e) => manualSearch(e.target.value)}
              placeholder="Or add a card by name…"
              className="input-base w-full px-4 py-3 text-sm"
            />
            {manualMatches.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {manualMatches.map((m) => (
                  <ManualMatchRow key={m.id} match={m} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {settingsSheet}
    </div>
  );
}
