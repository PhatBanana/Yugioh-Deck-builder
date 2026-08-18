import type { ReactNode } from "react";
import { useBackClose } from "../hooks/useBackClose";

// The app's bottom sheet: a dimmed backdrop, a rounded panel that rises from
// the bottom edge, a drag handle, and a title row with a close button. Every
// sheet in the app is this shape, so it lives here once — the layout, the
// safe-area padding, the Android back-button wiring and the tap-outside
// dismissal all behave the same everywhere by construction.
//
// Not for: `Confirm` (a centered alert, not a sheet) or `CardDetailModal`
// (becomes a centered dialog on wide screens). Those own their own chrome.

// Stacking order for floating layers. Sheets open over the page at `base`; a
// sheet opened *from* a sheet needs `stacked` to sit on top of its parent;
// `above` is for the one sheet (the rarity guide) that opens from a stacked
// one. Confirms and toasts live above all of these, in their own components.
export const SHEET_Z = {
  base: "z-[70]",
  stacked: "z-[80]",
  above: "z-[85]",
} as const;

export default function BottomSheet({
  onClose,
  title,
  subtitle,
  layer = "base",
  panelClass = "",
  stickyHeader = false,
  children,
}: {
  onClose: () => void;
  title: ReactNode;
  // Optional lead-in line under the title, in the standard muted style.
  subtitle?: ReactNode;
  layer?: keyof typeof SHEET_Z;
  // Extra classes for the panel — height caps, flex layout for sheets whose
  // body scrolls independently. `.sheet` already caps height at 92vh.
  panelClass?: string;
  // Pins the title row while the body scrolls. For long sheets, so the close
  // button stays reachable however far down you are.
  stickyHeader?: boolean;
  children: ReactNode;
}) {
  useBackClose(onClose);
  return (
    <div
      className={`sheet-backdrop ${SHEET_Z[layer]} flex items-end justify-center`}
      // Stop the tap here: when this sheet was opened from another one, a
      // backdrop tap that bubbled would dismiss both.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`sheet w-full sm:max-w-md rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div
          className={`flex items-center justify-between gap-3 ${
            stickyHeader ? "sticky top-0 z-10 -mx-4 px-4 -mt-1 pt-1 pb-2 bg-surface " : ""
          }${subtitle ? "mb-1" : "mb-3"}`}
        >
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-2xl leading-none px-1 shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {subtitle && <p className="text-xs text-neutral-500 mb-3">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
