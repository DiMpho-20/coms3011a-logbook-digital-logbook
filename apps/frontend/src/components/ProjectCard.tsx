import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, CircleDot, CloudOff, Edit2, Moon, MoreHorizontal, Trash2 } from "lucide-react";
import { formatDuration } from "../lib/utils";
import TagList from "./TagList";
import StatusChip from "./StatusChip";
import type { Project, TimeSummary } from "../api";

interface ProjectCardProps {
  project: Project;
  summary?: TimeSummary;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  /** When provided, the menu offers to delete the project permanently. */
  onDelete?: (project: Project) => void;
  /** A card in the grid, or a compact row in the list. */
  layout?: "grid" | "list";
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

/** "Today", "Yesterday", "24 days ago" — then a date once counting days stops helping. */
function relativeDay(dateStr: string): string {
  const diffDays = daysSince(dateStr);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 45) return `${diffDays} days ago`;
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * The card's secondary actions behind one "More" button: a small menu that
 * opens on click or keyboard, moves with the arrow keys, and closes on
 * Escape, Tab or a click elsewhere.
 */
function ProjectMenu({ project, onEdit, onToggleArchive, onDelete }: Omit<ProjectCardProps, "summary" | "layout">) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "ARCHIVED";

  const items = [
    { key: "edit", label: "Edit project", icon: Edit2, run: () => onEdit(project), danger: false },
    isArchived
      ? { key: "archive", label: "Unarchive", icon: ArchiveRestore, run: () => onToggleArchive(project), danger: false }
      : { key: "archive", label: "Archive", icon: Archive, run: () => onToggleArchive(project), danger: false },
    ...(onDelete ? [{ key: "delete", label: "Delete project", icon: Trash2, run: () => onDelete(project), danger: true }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    wrapperRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent) => {
    const all = Array.from(wrapperRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      all[event.key === "Home" ? 0 : all.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    // Above the card's stretched link, and its clicks stay its own.
    <div ref={wrapperRef} className="relative z-10" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More actions for ${project.name}`}
        title="More actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Actions for ${project.name}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {item.danger && <div className="my-1 border-t border-slate-100" role="separator" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  title={item.label}
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                    item.danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectCard({
  project,
  summary,
  onEdit,
  onToggleArchive,
  onDelete,
  layout = "grid",
}: ProjectCardProps) {
  const navigate = useNavigate();
  const isArchived = project.status === "ARCHIVED";
  const quiet =
    !isArchived && summary?.lastEntryAt != null && daysSince(summary.lastEntryAt) >= QUIET_AFTER_DAYS;

  // Status in words and an icon, not colour alone. Quiet is the same rule as before, shown as a status.
  const status = isArchived ? (
    <StatusChip icon={Archive}>Archived</StatusChip>
  ) : quiet ? (
    <StatusChip icon={Moon} title={`No entries in the last ${QUIET_AFTER_DAYS} days`}>Quiet</StatusChip>
  ) : (
    <StatusChip tone="success" icon={CircleDot}>Active</StatusChip>
  );
  const offline = project.id.startsWith("offline-") && (
    <span title="Created offline. It will be saved to your account when you reconnect.">
      <StatusChip tone="caution" icon={CloudOff}>Not synced yet</StatusChip>
    </span>
  );

  const entries = summary ? summary.entryCount.toLocaleString() : "—";
  const time = summary ? formatDuration(summary.totalMinutes) : "—";
  const lastActivity = !summary ? "—" : summary.lastEntryAt ? relativeDay(summary.lastEntryAt) : "No activity yet";

  const nameLink = (
    // The name is the card's link, stretched over it, so keyboards can open it too.
    <Link
      to={`/projects/${project.id}`}
      onClick={(e) => e.stopPropagation()}
      className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
    >
      {project.name}
    </Link>
  );

  // Archived projects sit on a softer surface; everything else on white.
  const shell = `relative rounded-xl border border-slate-200 transition-colors duration-150 hover:border-slate-300 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-blue-500 cursor-pointer ${
    isArchived ? "bg-slate-50" : "bg-white"
  }`;

  if (layout === "list") {
    return (
      <li className={`${shell} flex items-start gap-2 px-4 py-3 sm:items-center`} onClick={() => navigate(`/projects/${project.id}`)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <h3 className={`truncate text-sm font-semibold ${isArchived ? "text-slate-600" : "text-slate-900"}`}>{nameLink}</h3>
            {project.description && <p className="truncate text-xs text-slate-500">{project.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">{status}{offline}</div>
          <dl className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-slate-500 sm:w-64 sm:justify-end">
            <div><dt className="sr-only">Entries</dt><dd><span className="font-semibold text-slate-800">{entries}</span> {summary?.entryCount === 1 ? "entry" : "entries"}</dd></div>
            <div><dt className="sr-only">Time logged</dt><dd><span className="font-semibold text-slate-800">{time}</span> logged</dd></div>
            <div><dt className="sr-only">Last activity</dt><dd>{lastActivity}</dd></div>
          </dl>
        </div>
        <ProjectMenu project={project} onEdit={onEdit} onToggleArchive={onToggleArchive} onDelete={onDelete} />
      </li>
    );
  }

  return (
    <li className={`${shell} flex flex-col p-5`} onClick={() => navigate(`/projects/${project.id}`)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`min-w-0 text-[15px] font-semibold break-words ${isArchived ? "text-slate-600" : "text-slate-900"}`}>{nameLink}</h3>
        <ProjectMenu project={project} onEdit={onEdit} onToggleArchive={onToggleArchive} onDelete={onDelete} />
      </div>

      {project.description && (
        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{project.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">{status}{offline}</div>

      {project.tags && project.tags.length > 0 && <TagList tags={project.tags} className="mt-3" />}

      {/* Figures first to the eye, labels first in the markup (dt before dd). */}
      <div className="flex-1" />
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <div className="flex min-w-0 flex-col-reverse">
          <dt className="text-xs text-slate-500">{summary?.entryCount === 1 ? "entry" : "entries"}</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{entries}</dd>
        </div>
        <div className="flex min-w-0 flex-col-reverse">
          <dt className="text-xs text-slate-500">logged</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{time}</dd>
        </div>
        <div className="flex min-w-0 flex-col-reverse">
          <dt className="text-xs text-slate-500">last activity</dt>
          <dd className="truncate text-sm font-semibold text-slate-900">{lastActivity}</dd>
        </div>
      </dl>
    </li>
  );
}
