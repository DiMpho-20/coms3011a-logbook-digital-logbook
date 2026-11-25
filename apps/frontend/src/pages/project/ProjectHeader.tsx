import { Archive, ArchiveRestore, MoreVertical, Trash2 } from "lucide-react";

import type { ProjectWithFields } from "../../api";
import TagList from "../../components/TagList";

/**
 * The project's name and its two kinds of state: whether it is active, and
 * the menu of the things you can do to the project as a whole.
 */
export default function ProjectHeader({
  project,
  active,
  moreOpen,
  onToggleMore,
  onToggleArchive,
  onDelete,
}: {
  project: ProjectWithFields;
  active: boolean;
  moreOpen: boolean;
  onToggleMore: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
          {/* Status button */}
          <div className="relative">
            <button
              onClick={onToggleArchive}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {active ? "Active" : "Archived"}
            </button>
          </div>
          {/* More menu */}
          <div className="relative">
            <button
              onClick={onToggleMore}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-8 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44">
                <button
                  onClick={onToggleArchive}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition ${
                    active
                      ? "text-amber-600 hover:bg-amber-50"
                      : "text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                  {active ? "Archive project" : "Unarchive project"}
                </button>
                <button
                  onClick={onDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete project
                </button>
              </div>
            )}
          </div>
        </div>
        {project.description && (
          <p className="text-sm text-slate-500 mt-1">{project.description}</p>
        )}
        <TagList tags={project.tags} className="mt-2" />
      </div>
    </div>
  );
}
