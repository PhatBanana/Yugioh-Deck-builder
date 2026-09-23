import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { installedLangs, installLangPack, LANGS, removeLangPack } from "../services/langPacks";
import { installJpPrintings, jpPrintingsCount, removeJpPrintings } from "../services/jpPrintings";
import { toast } from "./Toaster";

// Optional card-data downloads, shown under Settings → Card data. They used to
// sit in Scan settings, but they widen search and deck building too — they're
// card data, not scan behaviour.

// Downloadable localized-name packs: each adds a language's card names to
// search and to the scanner's match pool (~1–2 MB per language).
// Japanese printings are a separate download from the name packs: names let
// you find an OCG card, this lets a scanned OCG set code resolve to a rarity.
export function JapanesePrintings() {
  const count = useLiveQuery(jpPrintingsCount, [], null);
  const [busy, setBusy] = useState(false);
  const installed = (count ?? 0) > 0;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (installed) {
        await removeJpPrintings();
        toast("Japanese printings removed", "success");
      } else {
        const n = await installJpPrintings();
        toast(`${n.toLocaleString()} Japanese printings installed`, "success");
      }
    } catch {
      toast("Couldn't download the printing pack — check your connection", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Japanese printings</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle()}
          className={`text-xs px-3 py-1.5 rounded-full border shrink-0 disabled:opacity-50 ${
            installed
              ? "bg-amber-400/15 border-amber-900/60 text-amber-200"
              : "bg-surface border-line text-neutral-400"
          }`}
        >
          {busy ? "…" : installed ? "Installed" : "Install (~0.7 MB)"}
        </button>
      </div>
      <span className="block text-xs text-neutral-500 mt-0.5">
        Set codes on OCG cards (RC04-JP001 and the like) aren't in the card
        database, so scanning one can't tell what rarity it is. This adds them.
        {installed && count ? ` ${count.toLocaleString()} printings stored.` : ""}
      </span>
    </div>
  );
}

export function LanguagePacks() {
  const installed = useLiveQuery(installedLangs, []);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(code: string, label: string) {
    if (busy) return;
    setBusy(code);
    try {
      if (installed?.has(code)) {
        await removeLangPack(code);
        toast(`${label} names removed`, "success");
      } else {
        const n = await installLangPack(code);
        toast(`${label}: ${n.toLocaleString()} card names installed`, "success");
      }
    } catch {
      toast(`Couldn't download the ${label} pack — check your connection`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="py-3">
      <span className="block text-sm">Card languages</span>
      <span className="block text-xs text-neutral-500 mt-0.5 mb-2">
        Adds a language's card names to search and scanning (~0.5 MB each,
        Japanese 1.2 MB). Install Japanese to scan OCG cards by name — the
        camera reads them once Text recognition below is set to Japanese.
        Korean names are searchable by typing, but can't be read by the
        camera.
      </span>
      <div className="flex flex-wrap gap-1.5">
        {LANGS.map((l) => {
          const on = installed?.has(l.code) ?? false;
          return (
            <button
              key={l.code}
              type="button"
              disabled={busy !== null}
              onClick={() => toggle(l.code, l.label)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
                  : "bg-surface border-line text-neutral-300"
              } ${busy === l.code ? "opacity-60" : ""}`}
            >
              {busy === l.code ? "…" : on ? "✓" : "+"} {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
