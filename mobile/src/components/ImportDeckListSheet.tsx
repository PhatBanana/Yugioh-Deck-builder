import { useState } from "react";
import {
  importDeckList,
  previewDeckList,
  type DeckListPreview,
} from "../services/deckListImport";
import { useBackClose } from "../hooks/useBackClose";
import { toast } from "./Toaster";

// Paste a written deck list (title, Monsters/Spells/Traps/Extra headers,
// "3 Card Name" lines — the format every deck site prints) and import it as
// a new deck. Preview-first: misspelled names are fuzzy-resolved and shown
// as "typed → matched" so a wrong guess is visible before anything saves.
export default function ImportDeckListSheet({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (deckId: string) => void;
}) {
  useBackClose(onClose);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<DeckListPreview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    setBusy(true);
    try {
      const p = await previewDeckList(text);
      if (p.resolved.length === 0) {
        toast("No card lines found — one card per line, like “3 Fallen of Albaz”", "error");
        return;
      }
      setPreview(p);
      setName(p.name ?? "Imported Deck");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const deck = await importDeckList(preview, name.trim() || "Imported Deck");
      toast(`Imported "${deck.name}"`, "success");
      onImported(deck.id);
    } catch {
      toast("Import failed — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  const fuzzy = preview?.resolved.filter((r) => r.how === "fuzzy") ?? [];
  const missing = preview?.resolved.filter((r) => r.how === "missing") ?? [];

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Import a deck list</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        {!preview ? (
          <>
            <p className="text-xs text-neutral-500 mb-3">
              Paste a written list — a title line, section headers (Monsters /
              Spell Cards / Trap Cards / Extra Deck / Side Deck) and one card
              per line ("3 Fallen of Albaz", "Branded Fusion x2"). Small typos
              are okay.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={"Branded Deck\n\nMonsters\n3 Fallen of Albaz\n…"}
              className="input-base w-full rounded-lg px-3 py-2 text-xs mb-3"
            />
            <button
              type="button"
              onClick={doPreview}
              disabled={busy || !text.trim()}
              className="btn-primary w-full py-3 text-sm disabled:opacity-40"
            >
              {busy ? "Checking…" : "Check list"}
            </button>
          </>
        ) : (
          <>
            <label className="block text-xs text-neutral-400 mb-1">Deck name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base w-full rounded-lg px-3 py-2 text-sm mb-3"
            />

            <p className="text-sm text-neutral-300 mb-2 tabular-nums">
              <span className="text-emerald-400 font-medium">{preview.exactCount}</span> matched
              {fuzzy.length > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-300 font-medium">{fuzzy.length}</span> matched with
                  corrections
                </>
              )}
              {missing.length > 0 && (
                <>
                  {" · "}
                  <span className="text-rose-400 font-medium">{missing.length}</span> not found
                </>
              )}
            </p>

            {fuzzy.length > 0 && (
              <div className="panel p-2.5 mb-2 text-xs">
                <div className="font-semibold text-amber-300 mb-1">Corrected names — check these</div>
                {fuzzy.map((r, i) => (
                  <div key={i} className="text-neutral-400 py-0.5">
                    "{r.line.name}" → <span className="text-neutral-200">{r.matchedName}</span>
                  </div>
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <div className="panel p-2.5 mb-2 text-xs">
                <div className="font-semibold text-rose-400 mb-1">
                  Not found — these will be skipped
                </div>
                {missing.map((r, i) => (
                  <div key={i} className="text-neutral-400 py-0.5">
                    {r.line.raw}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={doImport}
                disabled={busy || preview.resolved.length === missing.length}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-40"
              >
                {busy ? "Importing…" : "Import deck"}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="btn-ghost px-4 py-3 text-sm"
              >
                Edit list
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
