import Modal from "../../components/Modal";
import { button } from "../../lib/ui";
import type { SavedStatistics } from "./useSavedStatistics";

/**
 * Removing a saved statistic. It names the one about to go, and says plainly
 * that only the calculation is removed — nothing that was logged is touched.
 */
export default function DeleteStatisticModal({ saved }: { saved: SavedStatistics }) {
  return (
    <Modal open={saved.deleting !== null} onClose={saved.closeDelete} title="Delete statistic">
      <p className="text-sm text-slate-700">
        Delete “{saved.deleting?.name}”? The expression is removed; nothing you have logged is touched.
      </p>
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={saved.closeDelete} className={button("secondary")}>
          Cancel
        </button>
        <button type="button" onClick={saved.confirmDelete} className={button("danger")}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
