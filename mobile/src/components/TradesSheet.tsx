import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MCard, type MTrade } from "../db";
import { deleteTrade, listTrades, logTrade, type TradeSide } from "../services/trades";
import { searchCardsForPicker } from "../services/deckListImport";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import CardThumb from "./CardThumb";
import { toast } from "./Toaster";
import { formatUsd, signedUsd } from "../lib/util";
import BottomSheet from "./BottomSheet";

// Trade tracker: history of logged trades with net value, and a form to log a
// new one (search cards into "You gave" / "You got" piles).

function SideEditor({
  label,
  side,
  onChange,
}: {
  label: string;
  side: TradeSide[];
  onChange: (next: TradeSide[]) => void;
}) {
  const names = useLiveQuery(async () => {
    const cards = await db.cards.bulkGet(side.map((s) => s.cardId));
    return new Map(side.map((s, i) => [s.cardId, cards[i]?.name ?? `#${s.cardId}`]));
  }, [side]);
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-neutral-400 mb-1">{label}</div>
      {side.length === 0 && <p className="text-xs text-neutral-600">Tap search results to add.</p>}
      {side.map((s) => (
        <div key={s.cardId} className="flex items-center gap-1.5 py-0.5 text-sm">
          <span className="truncate flex-1">{names?.get(s.cardId) ?? "…"}</span>
          <span className="tabular-nums text-neutral-400">×{s.quantity}</span>
          <button
            type="button"
            className="text-neutral-500 px-1"
            aria-label={`Remove from ${label}`}
            onClick={() => onChange(side.filter((x) => x.cardId !== s.cardId))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function TradeRow({ trade }: { trade: MTrade }) {
  const net = trade.gotValueUsd - trade.gaveValueUsd;
  const summary = useLiveQuery(async () => {
    const label = async (side: TradeSide[]) => {
      if (side.length === 0) return "nothing";
      const first = await db.cards.get(side[0].cardId);
      const extra = side.length - 1;
      return `${first?.name ?? "?"}${extra > 0 ? ` +${extra}` : ""}`;
    };
    return { gave: await label(trade.gave), got: await label(trade.got) };
  }, [trade.id]);
  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">{trade.date.slice(0, 10)}</span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            net >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {signedUsd(net)}
        </span>
      </div>
      <p className="text-sm text-neutral-300 mt-0.5">
        Gave {summary?.gave ?? "…"} ({formatUsd(trade.gaveValueUsd)}) → got {summary?.got ?? "…"} (
        {formatUsd(trade.gotValueUsd)})
      </p>
      {trade.note && <p className="text-xs text-neutral-500 mt-0.5">{trade.note}</p>}
      <button
        type="button"
        onClick={() => void deleteTrade(trade.id)}
        className="text-[11px] text-neutral-600 underline mt-1"
      >
        Delete entry
      </button>
    </div>
  );
}

export default function TradesSheet({ onClose }: { onClose: () => void }) {
  const [creating, setCreating] = useState(false);
  const [gave, setGave] = useState<TradeSide[]>([]);
  const [got, setGot] = useState<TradeSide[]>([]);
  const [target, setTarget] = useState<"gave" | "got">("gave");
  const [note, setNote] = useState("");
  const [apply, setApply] = useState(true);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);

  const trades = useLiveQuery(() => listTrades(), [], []);
  // In-memory name index (with typo-tolerant fallback) — not a per-keystroke
  // 13k-row IndexedDB scan.
  const results = useLiveQuery(
    () => searchCardsForPicker(debounced, 8),
    [debounced],
    []
  );

  function addTo(card: MCard) {
    const setter = target === "gave" ? setGave : setGot;
    setter((prev) => {
      const existing = prev.find((s) => s.cardId === card.id);
      if (existing) {
        return prev.map((s) => (s.cardId === card.id ? { ...s, quantity: s.quantity + 1 } : s));
      }
      return [...prev, { cardId: card.id, quantity: 1 }];
    });
  }

  async function save() {
    if (gave.length === 0 && got.length === 0) return;
    const trade = await logTrade(gave, got, { note, applyToCollection: apply });
    const net = trade.gotValueUsd - trade.gaveValueUsd;
    toast(`Trade logged (${signedUsd(net)})`, "success");
    setGave([]);
    setGot([]);
    setNote("");
    setQuery("");
    setCreating(false);
  }

  return (
    <BottomSheet onClose={onClose} title="Trades">
      {!creating && (
        <>
          <button type="button" onClick={() => setCreating(true)} className="btn-primary w-full py-2.5 text-sm">
            ＋ Log a trade
          </button>
          <div className="flex flex-col gap-2 mt-3">
            {trades.map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
            {trades.length === 0 && (
              <p className="empty-state">
                No trades logged yet. Each entry stores both sides valued at the prices on that day.
              </p>
            )}
          </div>
        </>
      )}

      {creating && (
        <div className="flex flex-col gap-3">
          <div className="seg text-xs">
            {(["gave", "got"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`seg-btn py-1.5 ${target === t ? "seg-on" : ""}`}
              >
                {t === "gave" ? "Adding to: You gave" : "Adding to: You got"}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards to add…"
            className="input-base w-full px-4 py-2.5 text-sm"
          />
          {results.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addTo(c)}
                  className="pressable flex items-center gap-2 rounded-lg border border-line bg-raised p-1.5 text-left"
                >
                  <CardThumb img={c.img} w="w-7" h="h-10" />
                  <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                  <span className="text-xs text-neutral-500 shrink-0">
                    {c.price != null ? formatUsd(c.price) : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <SideEditor label="You gave" side={gave} onChange={setGave} />
            <SideEditor label="You got" side={got} onChange={setGot} />
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (who with, where)…"
            className="input-base w-full px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
            Update my collection quantities
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={gave.length === 0 && got.length === 0}
              onClick={() => void save()}
              className="btn-primary flex-1 py-2.5 text-sm"
            >
              Save trade
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost px-4 py-2.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
