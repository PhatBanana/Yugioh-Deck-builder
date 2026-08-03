import { useState } from "react";
import { importDeckCode } from "../services/deckShare";
import { useBackClose } from "../hooks/useBackClose";
import { toast } from "./Toaster";

// Paste a shared deck code (YGO1|…) to import it as a new deck.
export default function ImportDeckCodeSheet({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (deckId: string) => void;
}) {
  useBackClose(onClose);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function doImport() {
    setBusy(true);
    try {
      const deck = await importDeckCode(code);
      if (!deck) {
        toast("That doesn't look like a valid deck code", "error");
        return;
      }
      toast(`Imported "${deck.name}"`, "success");
      onImported(deck.id);
    } catch {
      toast("Import failed — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Import deck code</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Paste a code someone shared (starts with <span className="font-mono">YGO1|</span>).
        </p>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={4}
          placeholder="YGO1|…"
          className="input-base w-full rounded-lg px-3 py-2 text-xs font-mono mb-3"
        />
        <button
          type="button"
          onClick={doImport}
          disabled={busy || !code.trim()}
          className="btn-primary w-full py-3 text-sm disabled:opacity-40"
        >
          {busy ? "Importing…" : "Import deck"}
        </button>
      </div>
    </div>
  );
}
