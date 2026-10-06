import Modal from "./Modal";

export interface ConfirmOptions {
  title: string;
  message: string;
  /** The button that goes ahead, e.g. "Delete module". */
  confirmLabel: string;
  /** "danger" for anything that can't be undone. */
  tone?: "danger" | "default";
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * An in-app "are you sure?" in place of window.confirm: it can name its
 * buttons ("Delete module" rather than "OK") and matches the rest of the app.
 * Cancel takes focus first, so pressing Enter never deletes by accident.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, tone = "danger", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex justify-end gap-2 pt-5">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-3 py-2 text-sm font-medium rounded-lg text-white transition ${
            tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
