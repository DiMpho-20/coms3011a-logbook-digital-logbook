import { useEffect, useState } from "react";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { deleteProject, type Project } from "../api";
import Modal from "./Modal";

interface DeleteProjectModalProps {
  /** The project to delete; the dialog is closed while this is null. */
  project: Project | null;
  /** How many entries will be lost with it, when known. */
  entryCount?: number;
  onClose: () => void;
  onDeleted: (project: Project) => void;
  /** When provided, offers archiving as the reversible alternative. */
  onArchiveInstead?: (project: Project) => void;
}

/**
 * Deleting a project is permanent and takes every entry and version with
 * it, so the dialog says exactly what will be lost, offers archiving
 * instead, and needs the project's name typed before it will go ahead.
 */
export default function DeleteProjectModal({
  project,
  entryCount,
  onClose,
  onDeleted,
  onArchiveInstead,
}: DeleteProjectModalProps) {
  const [typedName, setTypedName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTypedName("");
    setError(null);
    setDeleting(false);
  }, [project?.id]);

  if (!project) return null;

  const confirmed = typedName.trim() === project.name.trim();
  const entriesText =
    entryCount === undefined
      ? "all of its entries"
      : entryCount === 1
        ? "its 1 entry"
        : `its ${entryCount} entries`;

  const handleDelete = async () => {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(project.id);
      onDeleted(project);
    } catch (err: unknown) {
      const offline = !navigator.onLine || !(err as { response?: unknown })?.response;
      setError(
        offline
          ? "You need to be online to delete a project that's saved to your account."
          : (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't delete the project. Try again."
      );
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Delete ${project.name}?`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          This permanently deletes <span className="font-semibold text-slate-900">{project.name}</span>, its entry
          fields and {entriesText}, including their version history. <span className="font-semibold">This can't be undone.</span>
        </p>

        {onArchiveInstead && project.status === "ACTIVE" && (
          <p className="text-xs text-slate-500">
            Want to keep the records? Archiving hides the project but keeps everything, and you can unarchive it later.
          </p>
        )}

        {error && (
          <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div>
          <label htmlFor="delete-project-name" className="block text-xs font-medium text-slate-600 mb-1">
            Type <span className="font-semibold text-slate-900">{project.name}</span> to confirm
          </label>
          <input
            id="delete-project-name"
            type="text"
            autoComplete="off"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleDelete();
            }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          {onArchiveInstead && project.status === "ACTIVE" && (
            <button
              type="button"
              onClick={() => onArchiveInstead(project)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-200 text-sm font-medium text-amber-700 hover:bg-amber-50 transition"
            >
              <Archive className="h-4 w-4" /> Archive instead
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete permanently
          </button>
        </div>
      </div>
    </Modal>
  );
}
