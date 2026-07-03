import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { NameMatch } from "@shared/scan/nameMatcher";
import { matchCardName } from "@shared/scan/nameMatcher";
import { db } from "../db";
import { addOwned } from "../services/collection";
import { getNameCandidates, isScanSupported, scanCard } from "../services/scanner";
import { toast } from "../components/Toaster";

function MatchRow({ match }: { match: NameMatch }) {
  const card = useLiveQuery(() => db.cards.get(match.id), [match.id]);
  const owned = useLiveQuery(
    async () => (await db.collection.get(match.id))?.quantity ?? 0,
    [match.id]
  );

  async function add() {
    const next = await addOwned(match.id, 1);
    toast(`${match.name} — now own ${next}`, "success");
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
      {card?.img ? (
        <img src={card.img} alt="" className="w-12 rounded" loading="lazy" />
      ) : (
        <div className="w-12 h-[70px] rounded bg-neutral-800" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug">{match.name}</div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {Math.round(match.score * 100)}% match
          {owned ? ` · own ${owned}` : ""}
          {card?.price != null ? ` · $${card.price.toFixed(2)}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={add}
        className="shrink-0 px-4 py-2.5 rounded-lg bg-emerald-700 active:bg-emerald-600 text-sm font-medium"
      >
        +1
      </button>
    </div>
  );
}

export default function ScanPage() {
  const [matches, setMatches] = useState<NameMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualMatches, setManualMatches] = useState<NameMatch[]>([]);
  const cardCount = useLiveQuery(() => db.cards.count());

  async function scan() {
    setBusy(true);
    try {
      const outcome = await scanCard();
      setMatches(outcome.matches);
      if (outcome.matches.length === 0) {
        toast("Couldn't match that photo — try filling the frame with the card name.", "error");
      }
    } catch (err) {
      // User cancelling the camera also lands here; stay quiet for that.
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) toast(`Scan failed: ${message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function manualSearch(q: string) {
    setManualQuery(q);
    if (q.trim().length < 3) {
      setManualMatches([]);
      return;
    }
    const candidates = await getNameCandidates();
    setManualMatches(matchCardName(q, candidates, { limit: 5, minScore: 0.4 }));
  }

  if (!cardCount) {
    return (
      <div className="p-6 text-center text-neutral-400 text-sm">
        Sync the card database first (Cards tab) — scanning matches photos against it.
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <button
        type="button"
        disabled={busy || !isScanSupported()}
        onClick={scan}
        className="w-full py-5 rounded-2xl bg-emerald-700 active:bg-emerald-600 disabled:opacity-40 text-lg font-semibold"
      >
        {busy ? "Reading card…" : "📷 Scan a card"}
      </button>
      {!isScanSupported() && (
        <p className="text-xs text-neutral-500 text-center">
          Camera scanning works in the Android app. Use the search below in the browser.
        </p>
      )}
      <p className="text-xs text-neutral-500 text-center -mt-2">
        Fill the frame with the card. Each +1 adds a copy to your collection.
      </p>

      {matches && matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-400">Best matches</h2>
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </div>
      )}

      <div className="mt-2">
        <input
          type="search"
          value={manualQuery}
          onChange={(e) => manualSearch(e.target.value)}
          placeholder="Or type a card name…"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
        />
        {manualMatches.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {manualMatches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
