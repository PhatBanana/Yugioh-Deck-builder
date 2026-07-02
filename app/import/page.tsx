"use client";

import { useRef, useState } from "react";
import { toast } from "../../components/Toaster";

interface MatchedEntry {
  cardId: number;
  name: string;
  quantity: number;
}

interface UnmatchedEntry {
  raw: string;
  reason: string;
}

interface ImportResponse {
  matched: MatchedEntry[];
  unmatched: UnmatchedEntry[];
  applied: number;
  error?: unknown;
}

type Mode = "add" | "set";

export default function ImportPage() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("add");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submit(apply: boolean) {
    if (!text.trim()) {
      toast("Paste a card list or choose a file first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode, apply }),
      });
      const data: ImportResponse = await res.json();
      if (!res.ok) {
        toast(typeof data.error === "string" ? data.error : "Import failed.", "error");
        return;
      }
      setPreview(data);
      if (apply) {
        toast(
          `Imported ${data.matched.length} card${data.matched.length === 1 ? "" : "s"} (${mode === "add" ? "added to" : "set in"} collection).`,
          "success"
        );
      }
    } catch {
      toast("Import request failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">Import Collection</h1>
      <p className="text-sm text-neutral-400 mb-4">
        Paste a card list (<code>3x Card Name</code>, <code>3 Card Name</code>, or one name per
        line), upload a <code>.ydk</code> deck file, or restore a JSON backup exported from this
        app.
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder={"3x Ash Blossom & Joyous Spring\n2 Effect Veiler\nInfinite Impermanence x3"}
        className="w-full h-56 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm font-mono resize-y focus:outline-none focus:border-neutral-600"
      />

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ydk,.txt,.json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
        >
          Choose file…
        </button>

        <div className="flex items-center gap-3 text-sm ml-auto">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === "add"}
              onChange={() => setMode("add")}
            />
            Add to owned
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === "set"}
              onChange={() => setMode("set")}
            />
            Set exact quantities
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => submit(false)}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-sm"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !preview || preview.matched.length === 0}
          onClick={() => submit(true)}
          className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-sm font-medium"
          title={!preview ? "Preview first to see what will be imported" : undefined}
        >
          {busy ? "Working…" : "Apply import"}
        </button>
      </div>

      {preview && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold mb-2 text-emerald-400">
              Matched ({preview.matched.length})
            </h2>
            <ul className="text-sm flex flex-col gap-1 max-h-96 overflow-y-auto pr-2">
              {preview.matched.map((m) => (
                <li key={m.cardId} className="flex justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  <span className="text-neutral-400 tabular-nums shrink-0">×{m.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2 text-red-400">
              Not found ({preview.unmatched.length})
            </h2>
            {preview.unmatched.length === 0 ? (
              <p className="text-sm text-neutral-500">Every line matched a card.</p>
            ) : (
              <ul className="text-sm flex flex-col gap-1 max-h-96 overflow-y-auto pr-2">
                {preview.unmatched.map((u, i) => (
                  <li key={i} className="text-neutral-400">
                    <span className="text-neutral-200">{u.raw}</span>
                    <span className="text-xs block text-neutral-500">{u.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
