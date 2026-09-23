import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  backupIsStale,
  createBackup,
  createCollectionCsv,
  exportTextFile,
  lastBackupAt,
  markBackedUp,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from "../services/backup";
import {
  checkForUpdateResult,
  installedBuild,
  openUpdate,
  RELEASES_PAGE,
} from "../services/appUpdate";
import { toast } from "./Toaster";
import { todayISO } from "../lib/util";
import { clearDiagnostics, diagnosticsCounts } from "../lib/diagnostics";
import { diagnosticsReport } from "../services/diagnosticsReport";
import BottomSheet from "./BottomSheet";
import { JapanesePrintings, LanguagePacks } from "./DataPacks";
import { runFullSync, useSyncProgress } from "../hooks/useCardSync";

// The app-wide Settings sheet, opened from the ⚙ in the header on any tab.
// Three sections, in the order people look for them:
//   Backup & restore — export (file / copy / CSV) and restore
//   Card data        — re-sync, language packs, Japanese printings
//   App              — updates, installed build, diagnostics
// These used to be split across a "Backup" button on the Cards tab (which
// also held updates and re-sync) and Scan settings (which held the packs).
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const syncing = useSyncProgress();
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [build, setBuild] = useState<number | null>(null);
  const [diag, setDiag] = useState(diagnosticsCounts);
  // Live so the "last backup" line updates the moment an export succeeds.
  const lastBackup = useLiveQuery(lastBackupAt, [], null);

  // Showing the installed build makes "did the update actually apply?"
  // answerable without guessing from behaviour.
  useEffect(() => {
    void installedBuild().then(setBuild);
  }, []);

  async function exportFile() {
    try {
      const backup = await createBackup();
      const name = `ygo-backup-${backup.exportedAt.slice(0, 10)}.json`;
      const outcome = await exportTextFile(name, "application/json", JSON.stringify(backup));
      if (outcome === "saved") {
        // Only an actual save counts as backed up — backing out doesn't.
        await markBackedUp();
        toast("Backup saved", "success");
      } else if (outcome === "failed") {
        toast("Couldn't save a file — use Copy instead", "error");
      }
    } catch {
      toast("Backup failed — couldn't read your data", "error");
    }
  }

  async function exportCsv() {
    try {
      const csv = await createCollectionCsv();
      const name = `ygo-collection-${todayISO()}.csv`;
      const outcome = await exportTextFile(name, "text/csv", csv);
      if (outcome === "saved") toast("CSV saved", "success");
      else if (outcome === "failed") toast("Couldn't save the CSV", "error");
    } catch {
      toast("CSV export failed", "error");
    }
  }

  async function exportCopy() {
    try {
      const json = JSON.stringify(await createBackup());
      await navigator.clipboard.writeText(json);
      await markBackedUp();
      toast("Backup copied — paste it somewhere safe", "success");
    } catch {
      toast("Couldn't copy the backup", "error");
    }
  }

  function stage(json: string) {
    try {
      setPending(parseBackup(json));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't read that backup", "error");
    }
  }

  function pickFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => stage(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  // For device testing: one paste gives the build, settings, recent OCR reads
  // and every error the user saw. Clipboard first (fastest to send); if the
  // webview refuses it, fall back to saving a file.
  async function copyDiagnostics() {
    const report = await diagnosticsReport();
    try {
      await navigator.clipboard.writeText(report);
      toast("Diagnostics copied — paste them into your message", "success");
    } catch {
      const outcome = await exportTextFile(`ygo-diagnostics-${todayISO()}.txt`, "text/plain", report);
      if (outcome === "saved") toast("Diagnostics saved", "success");
      else if (outcome === "failed") toast("Couldn't copy or save diagnostics", "error");
    }
  }

  function resetDiagnostics() {
    clearDiagnostics();
    setDiag(diagnosticsCounts());
    toast("Diagnostics cleared", "info");
  }

  async function checkUpdate() {
    setChecking(true);
    try {
      const res = await checkForUpdateResult(true);
      if (res.status === "update") {
        toast(`Update available (v${res.update.versionName})`, "info", {
          label: "Download",
          onClick: () => openUpdate(res.update),
        });
      } else if (res.status === "current") {
        toast(`You're on the latest build (${res.installed})`, "success");
      } else if (res.status === "unsupported") {
        toast("Update checks only work in the installed app", "info");
      } else if (res.status === "error") {
        // Never silently claim "up to date" when the check itself failed.
        toast(`Couldn't check for updates — ${res.message}`, "error");
      }
    } finally {
      setChecking(false);
    }
  }

  async function applyRestore() {
    if (!pending) return;
    try {
      const summary = await restoreBackup(pending);
      // The data now matches a file that exists outside the app — that
      // counts as backed up.
      await markBackedUp();
      toast(
        `Restored ${summary.cards} cards, ${summary.decks} decks, ${summary.wishlist} wishlisted` +
          (summary.trades != null ? `, ${summary.trades} trades` : ""),
        "success"
      );
      onClose();
    } catch {
      toast("Restore failed — your current data is unchanged", "error");
    }
  }

  return (
    <BottomSheet onClose={onClose} title="Settings" stickyHeader>
      {/* ---- Backup & restore -------------------------------------------- */}
      <Section title="Backup & restore" first>
        <p className="text-xs text-neutral-500 mb-1">
          Saves your collection, decks, wishlist, trade log and value/price
          history as one JSON file. The card database isn't included — it
          re-downloads on any device.
        </p>
        <p
          className={`text-xs mb-2 ${
            backupIsStale(lastBackup ?? null) ? "text-orange-300" : "text-emerald-300/90"
          }`}
        >
          {lastBackup
            ? `Last backup: ${lastBackup.toISOString().slice(0, 10)}`
            : "No backup yet — export one now, before you need it."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void exportFile()} className="btn-primary flex-1 py-2.5 text-sm">
            ⬇ Export — choose where to save
          </button>
          <button type="button" onClick={() => void exportCopy()} className="btn-ghost px-4 py-2.5 text-sm">
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="btn-ghost w-full py-2.5 text-sm mt-2"
        >
          🧾 Export collection as CSV (spreadsheet)
        </button>

        <h4 className="text-xs font-semibold text-neutral-400 mt-4 mb-1.5">Restore</h4>
        {pending ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-300">
              This backup has <b>{pending.collection.length}</b> collection entries,{" "}
              <b>{pending.decks.length}</b> decks and <b>{pending.wishlist.length}</b> wishlisted
              cards{pending.exportedAt ? ` (exported ${pending.exportedAt.slice(0, 10)})` : ""}.
            </p>
            <p className="text-xs text-orange-300">
              Restoring replaces your current collection, decks and wishlist
              {pending.trades ? ", and your trade log" : " (backups this old have no trades, so your trade log is kept)"}.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void applyRestore()} className="btn-primary flex-1 py-2.5 text-sm">
                Restore now
              </button>
              <button type="button" onClick={() => setPending(null)} className="btn-ghost px-4 py-2.5 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost py-2.5 text-sm">
              📄 Choose backup file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = "";
              }}
            />
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="…or paste a backup here"
              className="input-base w-full h-20 p-2.5 text-xs font-mono"
            />
            {pasted.trim() && (
              <button type="button" onClick={() => stage(pasted)} className="btn-ghost py-2 text-sm">
                Check pasted backup
              </button>
            )}
          </div>
        )}
      </Section>

      {/* ---- Card data ------------------------------------------------------ */}
      <Section title="Card data">
        <button
          type="button"
          disabled={!!syncing}
          onClick={() => void runFullSync()}
          className="btn-ghost w-full py-2.5 text-sm disabled:opacity-60"
        >
          {syncing ? `⏳ ${syncing}` : "🔃 Re-sync card database & prices"}
        </button>
        <LanguagePacks />
        <JapanesePrintings />
      </Section>

      {/* ---- App ------------------------------------------------------------ */}
      <Section title="App">
        <button
          type="button"
          disabled={checking}
          onClick={() => void checkUpdate()}
          className="btn-ghost w-full py-2.5 text-sm disabled:opacity-60"
        >
          {checking ? "Checking…" : "🔄 Check for app updates"}
        </button>
        <p className="text-[11px] text-neutral-600 mt-1 text-center">
          {build == null ? "Browser build" : `Installed build ${build}`} ·{" "}
          <button
            type="button"
            onClick={() => window.open(RELEASES_PAGE, "_blank")}
            className="text-amber-300/80"
          >
            all releases ↗
          </button>
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="btn-ghost flex-1 py-2.5 text-sm"
          >
            🩺 Copy diagnostics
          </button>
          {diag.events + diag.ocr > 0 && (
            <button type="button" onClick={resetDiagnostics} className="btn-ghost px-4 py-2.5 text-sm">
              Clear
            </button>
          )}
        </div>
        <p className="text-[11px] text-neutral-600 mt-1 text-center">
          {diag.events} errors · {diag.ocr} recent scans logged — send these when
          something misbehaves.
        </p>
      </Section>
    </BottomSheet>
  );
}

// A titled group with a divider above it (except the first).
function Section({ title, first, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <section className={first ? "" : "mt-5 pt-4 border-t border-line"}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80 mb-2">{title}</h3>
      {children}
    </section>
  );
}
