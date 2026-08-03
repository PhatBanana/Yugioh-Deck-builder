import { useEffect, useRef, useState } from "react";
import { useBackClose } from "../hooks/useBackClose";
import {
  nanoAsk,
  nanoAvailability,
  nanoDownload,
  nanoSupported,
  type NanoStatus,
} from "../services/geminiNano";

const DEFAULT_PROMPT =
  "This is a photo of a Yu-Gi-Oh! trading card. Look at the foil/holographic " +
  "treatment and tell me the card's rarity. Answer with just the rarity name " +
  "(Common, Rare, Super Rare, Ultra Rare, Secret Rare, Starlight Rare, etc.).";

// Experimental harness: take a photo of a card and see exactly what on-device
// Gemini Nano answers. This is the test of whether Nano can help with rarity.
export default function GeminiNanoLab({ onClose }: { onClose: () => void }) {
  useBackClose(onClose);
  const [status, setStatus] = useState<NanoStatus | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [preview, setPreview] = useState<string | null>(null);
  const b64Ref = useRef<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nanoAvailability().then(setStatus);
  }, []);

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      b64Ref.current = dataUrl.split(",")[1] ?? null;
      setAnswer(null);
    };
    reader.readAsDataURL(file);
  }

  async function download() {
    setBusy("Downloading model — this can take several minutes the first time…");
    try {
      await nanoDownload();
    } catch {
      /* surfaced via status refresh */
    }
    setStatus(await nanoAvailability());
    setBusy(null);
  }

  async function ask() {
    if (!b64Ref.current) return;
    setBusy("Asking Gemini Nano…");
    setAnswer(null);
    try {
      const r = await nanoAsk(b64Ref.current, prompt);
      if (r.status !== "available") {
        setStatus(r.status);
        setAnswer(`Model is "${r.status}" — download it first, then try again.`);
      } else {
        setAnswer(`${r.text || "(empty response)"}\n\n— ${r.ms ?? "?"}ms on device`);
      }
    } catch (e) {
      setAnswer(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(null);
  }

  const STATUS_LABEL: Record<NanoStatus, string> = {
    available: "✓ Gemini Nano ready on this device",
    downloadable: "Model available to download",
    downloading: "Model downloading…",
    unavailable: "Gemini Nano not available on this device",
    unsupported: "Only runs in the Android app",
  };

  return (
    <div className="sheet-backdrop z-[80] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">🧪 Gemini Nano</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          On-device AI experiment — see what Gemini Nano says about a card's rarity from a photo.
        </p>

        <div className="text-xs mb-3">
          <span
            className={
              status === "available"
                ? "text-emerald-400"
                : status === "unavailable" || status === "unsupported"
                  ? "text-red-400"
                  : "text-amber-300"
            }
          >
            {status ? STATUS_LABEL[status] : "Checking availability…"}
          </span>
          {status === "downloadable" && nanoSupported() && (
            <button
              type="button"
              onClick={download}
              disabled={!!busy}
              className="btn-ghost ml-2 px-2 py-1 text-xs"
            >
              Download model
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickImage} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-ghost w-full py-3 text-sm mb-3"
        >
          📷 Take / choose a card photo
        </button>

        {preview && <img src={preview} alt="" className="w-32 rounded-lg mx-auto mb-3 ring-1 ring-white/10" />}

        <label className="block text-xs text-neutral-400 mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="input-base w-full rounded-lg px-3 py-2 text-xs mb-3"
        />

        <button
          type="button"
          onClick={ask}
          disabled={!preview || !!busy || status !== "available"}
          className="btn-primary w-full py-3 text-sm disabled:opacity-40"
        >
          Ask Gemini Nano
        </button>

        {busy && <p className="text-xs text-amber-300 mt-3">{busy}</p>}
        {answer && (
          <div className="panel mt-3 p-3 text-sm whitespace-pre-wrap">{answer}</div>
        )}
      </div>
    </div>
  );
}
