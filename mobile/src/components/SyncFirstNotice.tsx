// Empty state shown on tabs that need the card database, with a button that
// jumps straight to the Cards tab (where the one-time download lives) instead
// of making the user find it themselves.
export default function SyncFirstNotice({
  reason,
  onGoToCards,
}: {
  reason: string;
  onGoToCards: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-center gap-4 text-center">
      <span className="text-3xl" aria-hidden>
        🃏
      </span>
      <p className="text-neutral-400 text-sm max-w-xs">
        Download the card database first — {reason}
      </p>
      <button type="button" onClick={onGoToCards} className="btn-primary px-6 py-3 text-sm">
        Set up on the Cards tab →
      </button>
    </div>
  );
}
