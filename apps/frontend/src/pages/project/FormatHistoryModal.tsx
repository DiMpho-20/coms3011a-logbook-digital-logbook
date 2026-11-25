import type { EntryField } from "../../api";
import Modal from "../../components/Modal";
import { formulaIdsToNames } from "../../lib/formulas";

export interface FormatVersion {
  id: string;
  version: number;
  fields: EntryField[];
  createdAt: string;
}

/**
 * The project's format over time: each version with its fields, so a change
 * to what the form asks can be seen rather than remembered.
 */
export default function FormatHistoryModal({
  open,
  onClose,
  versions,
}: {
  open: boolean;
  onClose: () => void;
  versions: FormatVersion[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="Entry format history">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {versions.length === 0 ? <p className="text-sm text-slate-500">No saved format versions yet.</p> : versions.map((version) => (
          <div key={version.id} className="border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-800">Version {version.version} <span className="text-xs font-normal text-slate-400">· {new Date(version.createdAt).toLocaleString()}</span></p>
            <ul className="mt-2 text-xs text-slate-600 space-y-1">
              {version.fields.map((field) => <li key={field.id}>{field.name} <span className="text-slate-400">({field.type})</span>{field.formula ? ` — ${formulaIdsToNames(field.formula, version.fields)}` : ""}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
