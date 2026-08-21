import { useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, Edit2 } from "lucide-react";
import { formatDuration } from "../lib/utils";
import type { Project, TimeSummary } from "../api";

interface ProjectCardProps {
  project: Project;
  summary?: TimeSummary;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
}

function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProjectCard({
  project,
  summary,
  onEdit,
  onToggleArchive,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const isArchived = project.status === "ARCHIVED";
  const isActive = project.status === "ACTIVE";

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition group cursor-pointer ${
        isArchived ? "opacity-60" : ""
      }`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Project name */}
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-2">
        {project.name}
      </h3>

      {/* Description */}
      {project.description ? (
        <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[2.5rem]">
          {project.description}
        </p>
      ) : (
        <div className="mb-4 min-h-[2.5rem]" />
      )}

      {/* Status badge */}
      <div className="mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span
            className={`w-2 h-2 rounded-full ${
              isActive ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {isActive ? "Active" : "Archived"}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-3" />

      {/* Stats */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">
          {summary?.entryCount ?? 0} {summary?.entryCount === 1 ? "entry" : "entries"}
        </p>
        <p className="text-sm font-semibold text-slate-800">
          {formatDuration(summary?.totalMinutes ?? 0)}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-3" />

      {/* Last activity */}
      <div>
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          Last activity
        </p>
        <p className="text-sm font-medium text-slate-700 mt-0.5">
          {summary?.lastEntryAt
            ? relativeDay(summary.lastEntryAt)
            : "No entries yet"}
        </p>
      </div>

      {/* Hover actions (only visible on hover) */}
      <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(project);
          }}
          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          title="Edit project"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(project);
          }}
          className={`p-1.5 rounded-md transition ${
            isArchived
              ? "text-emerald-600 hover:bg-emerald-50"
              : "text-slate-400 hover:bg-slate-100 hover:text-amber-600"
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
