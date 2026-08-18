import { useState } from "react";
import { importDeckCode } from "../services/deckShare";
import { toast } from "./Toaster";
import BottomSheet from "./BottomSheet";

// Paste a shared deck code (YGO1|…) to import it as a new deck.
export default function ImportDeckCodeSheet({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (deckId: string) => void;
}) {
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
    <BottomSheet
      onClose={onClose}
      title="Import deck code"
      subtitle={
        <>
          Paste a code someone shared (starts with <span className="font-mono">YGO1|</span>).
        </>
      }
    >
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
    </BottomSheet>
  );
}
