import { useState } from "react";
import { CONDITION_LABEL, type CardCondition } from "@shared/grading/analyze";
import { bulkAddTag, bulkRemove, bulkSetCondition, restoreEntries } from "../services/collection";
import { confirmDialog } from "./Confirm";
import { toast } from "./Toaster";

const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

// Fixed action bar shown while bulk-selecting owned cards. Applies one change
// (binder, condition, or removal) across every selected card, then clears the
// selection.
export default function BulkEditBar({
  ids,
  onDone,
}: {
  ids: number[];
  onDone: () => void;
}) {
  const [panel, setPanel] = useState<"tag" | "condition" | null>(null);
  const [tag, setTag] = useState("");
  const n = ids.length;

  async function addBinder() {
    const name = tag.trim();
    if (!name) return;
    await bulkAddTag(ids, name);
    setTag("");
    setPanel(null);
    toast(`Filed ${n} card${n === 1 ? "" : "s"} under "${name}"`, "success");
    onDone();
  }

  async function setCond(c: CardCondition | undefined) {
    await bulkSetCondition(ids, c);
    setPanel(null);
    toast(c ? `Set ${n} to ${CONDITION_LABEL[c]}` : `Cleared condition on ${n}`, "success");
    onDone();
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Remove ${n} card${n === 1 ? "" : "s"}?`,
      message: "They'll be taken out of your collection. You can undo right after.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const removed = await bulkRemove(ids);
    toast(`Removed ${removed.length} card${removed.length === 1 ? "" : "s"}`, "info", {
      label: "Undo",
      onClick: () => void restoreEntries(removed),
    });
    onDone();
  }

  const chip =
    "pressable px-3 py-1.5 rounded-lg text-xs font-medium bg-raised border border-line active:bg-overlay";

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-[75] px-3">
      <div className="sheet rounded-2xl p-2.5 shadow-lg max-w-md mx-auto">
        {panel === "tag" && (
          <div className="flex gap-1.5 mb-2">
            <input
              autoFocus
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBinder()}
              placeholder="Binder name (e.g. trade binder)…"
              className="input-base flex-1 rounded-lg px-3 py-2 text-sm"
            />
            <button type="button" onClick={addBinder} className="btn-primary px-3 py-2 rounded-lg text-sm">
              Add
            </button>
          </div>
        )}
        {panel === "condition" && (
          <div className="flex gap-1.5 mb-2">
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCond(c)} className={`${chip} flex-1`}>
                {c}
              </button>
            ))}
            <button type="button" onClick={() => setCond(undefined)} className={`${chip} text-neutral-500`}>
              Clear
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums pl-1">{n} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setPanel(panel === "tag" ? null : "tag")}
            disabled={n === 0}
            className={`${chip} disabled:opacity-40`}
          >
            Binder
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "condition" ? null : "condition")}
            disabled={n === 0}
            className={`${chip} disabled:opacity-40`}
          >
            Condition
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={n === 0}
            className="pressable px-3 py-1.5 rounded-lg text-xs font-medium bg-red-950/60 border border-red-900/60 text-red-200 active:bg-red-900/50 disabled:opacity-40"
          >
            Remove
          </button>
          <button type="button" onClick={onDone} className={chip} aria-label="Done selecting">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
