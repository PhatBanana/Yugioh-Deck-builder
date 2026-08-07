import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { toggleWishlist } from "../services/wishlist";

// Heart toggle backed by the wishlist store; reflects state live. Long lists
// pass `wished` from one shared query (controlled mode) so a 400-row sheet
// doesn't mount 400 individual live queries; standalone uses query per-card.
export default function WishlistButton({
  cardId,
  wished: wishedProp,
  className = "",
}: {
  cardId: number;
  wished?: boolean;
  className?: string;
}) {
  const controlled = wishedProp !== undefined;
  // In controlled mode the querier touches no table, so it subscribes to
  // nothing and never re-runs.
  const own = useLiveQuery(
    async () => (controlled ? false : (await db.wishlist.get(cardId)) != null),
    [cardId, controlled],
    false
  );
  const wished = controlled ? wishedProp : own;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleWishlist(cardId);
      }}
      className={`shrink-0 text-lg leading-none ${wished ? "text-rose-400" : "text-neutral-500"} ${className}`}
      aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={wished}
    >
      {wished ? "♥" : "♡"}
    </button>
  );
}
