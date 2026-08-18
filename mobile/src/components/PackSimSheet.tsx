import { useEffect, useMemo, useState } from "react";
import { drawPack, getSetPool, type PackCard, type SetPool } from "../services/packSim";
import { foilClass, rarityRank } from "../lib/foil";
import { formatUsd } from "../lib/util";
import { useCardDetail } from "./CardDetailModal";
import { buzz } from "../lib/haptics";
import BottomSheet from "./BottomSheet";

// A fun gimmick: rip a virtual booster of a set, using its real card pool and
// era-accurate pull ratios (approximate — picked from the set's release date).
export default function PackSimSheet({ setName, onClose }: { setName: string; onClose: () => void }) {
  const openCard = useCardDetail();
  const [pool, setPool] = useState<SetPool | null>(null);
  const [pack, setPack] = useState<PackCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetPool(setName).then((p) => !cancelled && setPool(p));
    return () => {
      cancelled = true;
    };
  }, [setName]);

  function rip() {
    if (!pool || pool.cards.length === 0) return;
    buzz();
    setPack(drawPack(pool));
  }

  const packValue = useMemo(
    () => (pack ? pack.reduce((s, c) => s + (c.price ?? 0), 0) : 0),
    [pack]
  );
  // The best pull (rarest, then priciest) gets a little callout.
  const best = useMemo(() => {
    if (!pack) return null;
    return [...pack].sort(
      (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (b.price ?? 0) - (a.price ?? 0)
    )[0];
  }, [pack]);

  return (
    <BottomSheet
      onClose={onClose}
      title="📦 Pack simulator"
      layer="stacked"
    >
      <p className="text-xs text-neutral-500 mb-3 truncate">{setName}</p>

      {pool === null ? (
        <p className="empty-state">Loading set…</p>
      ) : pool.cards.length === 0 ? (
        <p className="empty-state">
          No rarity data for this set — re-sync the card database and try again.
        </p>
      ) : (
        <>
          {pack && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {pack.map((c, i) => {
                  const foil = foilClass(c.rarity);
                  return (
                    <button
                      key={`${c.cardId}-${i}`}
                      type="button"
                      onClick={() => openCard(c.cardId)}
                      className="pressable text-left pop-in"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className="relative block">
                        {c.img ? (
                          <img src={c.img} alt={c.name} className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
                        ) : (
                          <span className="block w-full aspect-[59/86] rounded-md bg-raised" />
                        )}
                        {foil && <span aria-hidden className={`foil ${foil}`} />}
                      </span>
                      <span className="block text-[9px] leading-tight text-neutral-400 mt-0.5 line-clamp-1">
                        {c.rarity}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-neutral-400">
                  Pack value ≈ <span className="text-amber-300 tabular-nums">{formatUsd(packValue)}</span>
                </span>
                {/* No callout when the "best" pull is just a Common. */}
                {best && rarityRank(best.rarity) > 1 && (
                  <span className="text-neutral-400 truncate ml-2">
                    Best pull: <span className="text-amber-200">{best.rarity}</span>
                  </span>
                )}
              </div>
            </>
          )}

          <button type="button" onClick={rip} className="btn-primary w-full py-3 text-sm">
            {pack ? "📦 Open another pack" : "📦 Open a pack"}
          </button>
          <p className="text-[11px] text-neutral-600 text-center mt-2">
            {pool.profile.label} odds, era-accurate but approximate.
          </p>
        </>
      )}
    </BottomSheet>
  );
}

