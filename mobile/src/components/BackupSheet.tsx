import { useRef, useState } from "react";
import {
  createBackup,
  createCollectionCsv,
  exportTextFile,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from "../services/backup";
import { useBackClose } from "../hooks/useBackClose";
import { checkForUpdate, installedBuild, openUpdate } from "../services/appUpdate";
import { toast } from "./Toaster";

// Bottom sheet for exporting the collection/decks as a JSON file and
// restoring from one (file pick or paste) — plus app/data upkeep (card
// re-sync, update check) so those live in one predictable place.
export default function BackupSheet({
  onClose,
  syncing,
  onSync,
}: {
  onClose: () => void;
  // Card-database re-sync, provided by the page that owns the sync state.
  syncing?: string | null;
  onSync?: () => void;
}) {
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useBackClose(onClose);

  async function exportFile() {
    try {
      const backup = await createBackup();
      const name = `ygo-backup-${backup.exportedAt.slice(0, 10)}.json`;
      const ok = await exportTextFile(name, "application/json", JSON.stringify(backup));
      if (!ok) toast("Couldn't save a file — use Copy instead", "error");
    } catch {
      toast("Backup failed — couldn't read your data", "error");
    }
  }

  async function exportCsv() {
    try {
      const csv = await createCollectionCsv();
      const name = `ygo-collection-${new Date().toISOString().slice(0, 10)}.csv`;
      const ok = await exportTextFile(name, "text/csv", csv);
      if (!ok) toast("Couldn't save the CSV", "error");
    } catch {
      toast("CSV export failed", "error");
    }
  }

  async function exportCopy() {
    try {
      const json = JSON.stringify(await createBackup());
      await navigator.clipboard.writeText(json);
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

  async function checkUpdate() {
    if ((await installedBuild()) == null) {
      toast("Update checks only work in the installed app", "info");
      return;
    }
    const u = await checkForUpdate(true);
    if (u) {
      toast(`Update available (v${u.versionName})`, "info", {
        label: "Download",
        onClick: () => openUpdate(u),
      });
    } else {
      toast("You're on the latest build", "success");
    }
  }

  async function applyRestore() {
    if (!pending) return;
    try {
      const summary = await restoreBackup(pending);
      toast(
        `Restored ${summary.cards} cards, ${summary.decks} decks, ${summary.wishlist} wishlisted`,
        "success"
      );
      onClose();
    } catch {
      toast("Restore failed — your current data is unchanged", "error");
    }
  }

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Backup & restore</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        <p className="text-xs text-neutral-500 mb-2">
          Saves your collection, decks, wishlist and value/price history as one
          JSON file. The card database isn't included — it re-downloads on any
          device.
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
        <button
          type="button"
          onClick={() => void checkUpdate()}
          className="btn-ghost w-full py-2.5 text-sm mt-2"
        >
          🔄 Check for app updates
        </button>
        {onSync && (
          <button
            type="button"
            disabled={!!syncing}
            onClick={onSync}
            className="btn-ghost w-full py-2.5 text-sm mt-2 disabled:opacity-60"
          >
            {syncing ? `⏳ ${syncing}` : "🔃 Re-sync card database & prices"}
          </button>
        )}

        <div className="mt-4 pt-3 border-t border-line">
          <h3 className="text-sm font-semibold mb-1.5">Restore</h3>
          {pending ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-neutral-300">
                This backup has <b>{pending.collection.length}</b> collection entries,{" "}
                <b>{pending.decks.length}</b> decks and <b>{pending.wishlist.length}</b> wishlisted
                cards{pending.exportedAt ? ` (exported ${pending.exportedAt.slice(0, 10)})` : ""}.
              </p>
              <p className="text-xs text-orange-300">
                Restoring replaces your current collection, decks and wishlist.
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
        </div>
      </div>
    </div>
  );
}
