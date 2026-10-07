import { Link, useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, CircleDot, CloudOff, Edit2, Moon, Trash2 } from "lucide-react";
import { formatDuration } from "../lib/utils";
import TagList from "./TagList";
import StatusChip from "./StatusChip";
import type { Project, TimeSummary } from "../api";

interface ProjectCardProps {
  project: Project;
  summary?: TimeSummary;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  /** When provided, shows a button to delete the project permanently. */
  onDelete?: (project: Project) => void;
}

/** An active project with no entry for this long reads as quiet: worth a look, not a warning. */
const QUIET_AFTER_DAYS = 14;

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today.getTime() - target.getTime()) / 86400000);
}

function relativeDay(dateStr: string): string {
  const diffDays = daysSince(dateStr);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProjectCard({
  project,
  summary,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const isArchived = project.status === "ARCHIVED";
  const quiet =
    !isArchived && summary?.lastEntryAt != null && daysSince(summary.lastEntryAt) >= QUIET_AFTER_DAYS;

  const iconButton = "relative z-10 p-2 rounded-lg transition";

  return (
    <div
      className={`relative flex flex-col bg-white rounded-xl border border-slate-200 p-5 transition duration-150 hover:border-slate-300 hover:shadow-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-blue-500 group cursor-pointer ${
        isArchived ? "opacity-70" : ""
      }`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] font-semibold text-slate-900">
          {/* The name is the card's link, stretched over it, so keyboards can open it too. */}
          <Link
            to={`/projects/${project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {project.name}
          </Link>
        </h3>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {isArchived ? (
            <StatusChip icon={Archive}>Archived</StatusChip>
          ) : (
            <StatusChip tone="success" icon={CircleDot}>Active</StatusChip>
          )}
          {project.id.startsWith("offline-") && (
            <span title="Created offline. It will be saved to your account when you reconnect.">
              <StatusChip tone="caution" icon={CloudOff}>Not synced yet</StatusChip>
            </span>
          )}
        </div>
      </div>

      {project.description && (
        <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{project.description}</p>
      )}

      {project.tags && project.tags.length > 0 && <TagList tags={project.tags} className="mt-3" />}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <div>
          <dt className="text-xs text-slate-500">Entries</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-800">
            {summary ? `${summary.entryCount} ${summary.entryCount === 1 ? "entry" : "entries"}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Time logged</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-800">
            {summary ? formatDuration(summary.totalMinutes) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Last activity</dt>
          <dd className="text-sm font-medium text-slate-700">
            {!summary ? "—" : summary.lastEntryAt ? relativeDay(summary.lastEntryAt) : "No entries yet"}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2">
        {quiet ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Moon className="h-3.5 w-3.5" aria-hidden="true" /> Quiet for a while
          </span>
        ) : (
          <span />
        )}
        {/* Always there on touch screens; on larger screens they appear on hover or keyboard focus. */}
        <div className="flex items-center gap-0.5 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
            className={`${iconButton} text-slate-500 hover:bg-slate-100 hover:text-slate-700`}
            title="Edit project"
            aria-label={`Edit ${project.name}`}
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleArchive(project);
            }}
            className={`${iconButton} ${
              isArchived ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-500 hover:bg-slate-100 hover:text-amber-600"
            }`}
            title={isArchived ? "Unarchive" : "Archive"}
            aria-label={isArchived ? `Unarchive ${project.name}` : `Archive ${project.name}`}
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
              className={`${iconButton} text-slate-500 hover:bg-red-50 hover:text-red-600`}
              title="Delete project permanently"
              aria-label="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
