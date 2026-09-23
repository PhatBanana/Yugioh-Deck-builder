import BottomSheet, { type SHEET_Z } from "./BottomSheet";

// A bottom sheet listing a few labelled actions — the app's menu pattern
// (deck Share / ⋯ menus, the deck list's Import). A tap closes the sheet
// first, then runs the action, so whatever the action opens (a file picker,
// a confirm, another sheet) isn't stacked under a menu that's still open.
export interface Action {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export default function ActionSheet({
  title,
  actions,
  onClose,
  layer,
}: {
  title: string;
  actions: Action[];
  onClose: () => void;
  layer?: keyof typeof SHEET_Z;
}) {
  return (
    <BottomSheet onClose={onClose} title={title} layer={layer}>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.disabled}
            onClick={() => {
              onClose();
              a.onClick();
            }}
            className={`${a.danger ? "btn-danger" : "btn-ghost"} w-full py-3 px-4 text-sm text-left disabled:opacity-50`}
          >
            <span className="block">{a.label}</span>
            {a.hint && <span className="block text-[11px] text-neutral-500 mt-0.5">{a.hint}</span>}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
