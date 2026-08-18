import { useEffect, useState } from "react";
import type { DeckSection } from "@shared/deck/types";
import {
  importDeckList,
  previewDeckList,
  repickLine,
  searchCardsForPicker,
  type ResolvedLine,
} from "../services/deckListImport";
import type { MCard } from "../db";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import CardThumb from "./CardThumb";
import BottomSheet from "./BottomSheet";
import { toast } from "./Toaster";

// Paste a written deck list (title, Monsters/Spells/Traps/Extra headers,
// "3 Card Name" lines) and import it as a new deck. Preview-first, card by
// card WITH art: every line shows the card it resolved to, corrections are
// flagged with what was typed, and any row can be tapped to swap in the
// right card before anything saves.
export default function ImportDeckListSheet({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (deckId: string) => void;
}) {
  const [text, setText] = useState("");
  const [resolved, setResolved] = useState<ResolvedLine[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState<number | null>(null); // index being re-picked

  async function doPreview() {
    setBusy(true);
    try {
      const p = await previewDeckList(text);
      if (p.resolved.length === 0) {
        toast("No card lines found — one card per line, like “3 Fallen of Albaz”", "error");
        return;
      }
      setResolved(p.resolved);
      setName(p.name ?? "Imported Deck");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!resolved) return;
    setBusy(true);
    try {
      const deck = await importDeckList(resolved, name.trim() || "Imported Deck");
      toast(`Imported "${deck.name}"`, "success");
      onImported(deck.id);
    } catch {
      toast("Import failed — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  const fuzzyCount = resolved?.filter((r) => r.how === "fuzzy").length ?? 0;
  const missingCount = resolved?.filter((r) => r.how === "missing").length ?? 0;
  const matchedCount = (resolved?.length ?? 0) - missingCount;

  return (
    <>
      <BottomSheet onClose={onClose} title="Import a deck list">

        {!resolved ? (
          <>
            <p className="text-xs text-neutral-500 mb-3">
              Paste a written list — a title line, section headers (Monsters /
              Spell Cards / Trap Cards / Extra Deck / Side Deck) and one card
              per line ("3 Fallen of Albaz", "Branded Fusion x2"). Small typos
              are okay — you'll see every match before it saves.
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
              className="input-base w-full rounded-lg px-3 py-2 text-sm mb-2"
            />

            <p className="text-xs text-neutral-400 mb-1 tabular-nums">
              <span className="text-emerald-400 font-medium">{matchedCount}</span> matched
              {fuzzyCount > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-300 font-medium">{fuzzyCount}</span> corrected
                </>
              )}
              {missingCount > 0 && (
                <>
                  {" · "}
                  <span className="text-rose-400 font-medium">{missingCount}</span> not found
                </>
              )}
            </p>
            <p className="text-[11px] text-neutral-600 mb-2">
              Check the art matches the card you meant — tap any row to change it.
            </p>

            {(["main", "extra", "side"] as const).map((section) => (
              <PreviewSection
                key={section}
                section={section}
                resolved={resolved}
                onFix={setFixing}
              />
            ))}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={doImport}
                disabled={busy || matchedCount === 0}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-40"
              >
                {busy ? "Importing…" : `Import ${matchedCount} cards`}
              </button>
              <button
                type="button"
                onClick={() => setResolved(null)}
                className="btn-ghost px-4 py-3 text-sm"
              >
                Edit list
              </button>
            </div>
          </>
        )}
      </BottomSheet>

      {fixing !== null && resolved && (
        <FixMatchOverlay
          line={resolved[fixing]}
          onPick={(card) => {
            setResolved(repickLine(resolved, fixing, card));
            setFixing(null);
          }}
          onClose={() => setFixing(null)}
        />
      )}
    </>
  );
}

const SECTION_LABEL: Record<DeckSection, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

function PreviewSection({
  section,
  resolved,
  onFix,
}: {
  section: DeckSection;
  resolved: ResolvedLine[];
  onFix: (index: number) => void;
}) {
  const rows = resolved
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.section === section);
  if (rows.length === 0) return null;
  const count = rows.reduce((n, { r }) => n + (r.cardId != null ? r.line.quantity : 0), 0);
  return (
    <div className="mt-2">
      <h3 className="text-xs font-semibold text-amber-300/90 mb-1">
        {SECTION_LABEL[section]} ({count})
      </h3>
      <div className="flex flex-col divide-y divide-line/70">
        {rows.map(({ r, index }) => {
          // A correction (or unmatched line) shows what was typed so a wrong
          // guess is visible next to the art it resolved to.
          const corrected =
            r.matchedName && r.matchedName.toLowerCase() !== r.line.name.toLowerCase();
          return (
            <button
              key={index}
              type="button"
              onClick={() => onFix(index)}
              className="flex items-center gap-2.5 w-full text-left py-1.5"
            >
              {r.cardId != null ? (
                <CardThumb img={r.img ?? null} w="w-9" h="h-[52px]" />
              ) : (
                <span className="w-9 h-[52px] shrink-0 rounded bg-raised flex items-center justify-center text-rose-400 text-lg">
                  ?
                </span>
              )}
              <div className="min-w-0 flex-1">
                {r.cardId != null ? (
                  <>
                    <div className="text-sm truncate">{r.matchedName}</div>
                    {corrected && (
                      <div
                        className={`text-[11px] truncate ${
                          r.how === "manual" ? "text-neutral-500" : "text-amber-300"
                        }`}
                      >
                        typed: "{r.line.name}"
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm text-rose-400 truncate">Not found — tap to pick</div>
                    <div className="text-[11px] text-neutral-500 truncate">"{r.line.name}"</div>
                  </>
                )}
              </div>
              <span className="text-xs text-neutral-400 tabular-nums shrink-0">
                ×{r.line.quantity}
              </span>
              <span className="text-neutral-600 shrink-0">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Full-height picker for correcting one line: search (typo-tolerant — falls
// back to the fuzzy matcher when substring finds nothing) with art results.
function FixMatchOverlay({
  line,
  onPick,
  onClose,
}: {
  line: ResolvedLine;
  onPick: (card: MCard) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(line.line.name);
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<MCard[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    searchCardsForPicker(debounced)
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <BottomSheet
      onClose={onClose}
      title={`Which card is "${line.line.name}"?`}
      layer="stacked"
      panelClass="h-[80vh] flex flex-col"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search card names…"
        className="input-base w-full rounded-lg px-3 py-2 text-sm mb-2"
      />
      <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-line/70">
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            className="flex items-center gap-2.5 w-full text-left py-1.5"
          >
            <CardThumb img={c.img} w="w-9" h="h-[52px]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{c.name}</div>
              <div className="text-[11px] text-neutral-500 truncate">{c.type}</div>
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <p className="empty-state">
            {searching
              ? "Searching…"
              : query.trim().length < 2
                ? "Type at least two letters."
                : "No cards match — try fewer words."}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
