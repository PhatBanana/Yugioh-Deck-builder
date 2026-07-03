import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { toggleWishlist } from "../services/wishlist";

// Heart toggle backed by the wishlist store; reflects state live.
export default function WishlistButton({
  cardId,
  className = "",
}: {
  cardId: number;
  className?: string;
}) {
  const wished = useLiveQuery(async () => (await db.wishlist.get(cardId)) != null, [cardId], false);
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
