import { useState } from "react";
import { applyImport, resolveImport, type ImportResult } from "../services/collection";
import { toast } from "./Toaster";

// Paste-a-list collection import (3x Name lines, .ydk contents, or a JSON
// backup), lifted from the former Import tab. Lives on the Scan tab's
// "Paste list" mode.
export default function PasteImport() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setPreview(await resolveImport(text));
    } catch (err) {
      toast(`Couldn't parse: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    if (!preview || preview.matched.length === 0) return;
    setBusy(true);
    try {
      await applyImport(preview.matched, mode);
      toast(`Imported ${preview.matched.length} cards`, "success");
      setText("");
      setPreview(null);
    } catch (err) {
      toast(`Import failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        Paste a list — <code>3x Card Name</code>, <code>3 Card Name</code>, one name per line, a
        .ydk file's contents, or a JSON backup from the desktop app.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder={"3x Ash Blossom & Joyous Spring\n2 Effect Veiler"}
        className="input-base w-full h-44 p-3 text-sm font-mono"
      />

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />
          Add
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "set"} onChange={() => setMode("set")} />
          Set exact
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={doPreview}
            className="btn-ghost px-3.5 py-2 rounded-lg text-sm"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || !preview || preview.matched.length === 0}
            onClick={doApply}
            className="btn-primary px-3.5 py-2 rounded-lg text-sm"
          >
            Apply
          </button>
        </div>
      </div>

      {preview && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-emerald-400 mb-1">
              Matched ({preview.matched.length})
            </h2>
            <ul className="text-sm flex flex-col gap-0.5 max-h-56 overflow-y-auto">
              {preview.matched.map((m) => (
                <li key={m.cardId} className="flex justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  <span className="text-neutral-500 tabular-nums shrink-0">×{m.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
          {preview.unmatched.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-400 mb-1">
                Not found ({preview.unmatched.length})
              </h2>
              <ul className="text-xs text-neutral-500 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                {preview.unmatched.map((u, i) => (
                  <li key={i}>{u.raw}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
