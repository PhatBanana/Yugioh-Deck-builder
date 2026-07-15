import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  createBackup,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from "../services/backup";
import { useBackClose } from "../hooks/useBackClose";
import { toast } from "./Toaster";

// Bottom sheet for exporting the collection/decks as a JSON file and
// restoring from one (file pick or paste).
export default function BackupSheet({ onClose }: { onClose: () => void }) {
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useBackClose(onClose);

  async function exportFile() {
    const backup = await createBackup();
    const json = JSON.stringify(backup);
    const name = `ygo-backup-${backup.exportedAt.slice(0, 10)}.json`;

    // On Android, open the system share sheet so the user picks the
    // destination (Files, Drive, email, …) instead of a silent drop into a
    // folder they'd have to hunt for.
    if (Capacitor.isNativePlatform()) {
      try {
        const file = await Filesystem.writeFile({
          path: name,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: name,
          url: file.uri,
          dialogTitle: "Save your backup to…",
        });
      } catch (err) {
        // Dismissing the share sheet lands here too — only real failures toast.
        const msg = err instanceof Error ? err.message : "";
        if (!/cancel/i.test(msg)) toast("Couldn't share the file — use Copy instead", "error");
      }
      return;
    }

    // Browser: a normal download (the browser controls where it saves).
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast("Backup exported", "success");
    } catch {
      toast("Couldn't save a file — use Copy instead", "error");
    }
  }

  async function exportCopy() {
    const json = JSON.stringify(await createBackup());
    try {
      await navigator.clipboard.writeText(json);
      toast("Backup copied — paste it somewhere safe", "success");
    } catch {
      toast("Couldn't access the clipboard", "error");
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

  async function applyRestore() {
    if (!pending) return;
    const summary = await restoreBackup(pending);
    toast(
      `Restored ${summary.cards} cards, ${summary.decks} decks, ${summary.wishlist} wishlisted`,
      "success"
    );
    onClose();
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
