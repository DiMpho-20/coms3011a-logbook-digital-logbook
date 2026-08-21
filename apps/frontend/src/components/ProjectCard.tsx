import { useNavigate } from "react-router-dom";
import { Clock, FileText, Archive, ArchiveRestore, Edit2 } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { formatDuration } from "../lib/utils";
import type { Project, TimeSummary } from "../api";

interface ProjectCardProps {
  project: Project;
  summary?: TimeSummary;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
}

export default function ProjectCard({
  project,
  summary,
  onEdit,
  onToggleArchive,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const isArchived = project.status === "ARCHIVED";

  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition group ${
        isArchived ? "opacity-70" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <button
          onClick={() => navigate(`/projects/${project.id}`)}
          className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition text-left"
        >
          {project.name}
        </button>
        <StatusBadge status={project.status} />
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{project.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
        {summary && (
          <>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-slate-400" />
              {summary.entryCount} entries
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {formatDuration(summary.totalMinutes)}
            </span>
            {summary.lastEntryAt && (
              <span className="text-slate-400">
                Last: {new Date(summary.lastEntryAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => navigate(`/projects/${project.id}`)}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition"
          title="View project"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onEdit(project)}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          title="Edit project"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onToggleArchive(project)}
          className={`p-1.5 rounded-md transition ${
            isArchived
              ? "text-emerald-600 hover:bg-emerald-50"
              : "text-slate-500 hover:bg-slate-100 hover:text-amber-600"
          }`}
          title={isArchived ? "Unarchive" : "Archive"}
        >
          {isArchived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
