import { Link } from "react-router-dom";
import { Clock, AlertTriangle, Pencil, Trash2, History, Archive, ArchiveRestore } from "lucide-react";
import { formatDuration, isEmptyValue } from "../lib/utils";
import TagList from "./TagList";
import type { ChecklistItem, Entry, EntryField } from "../api";

interface EntryCardProps {
  entry: Entry;
  projectName?: string;
  fields?: EntryField[];
  showProject?: boolean;
  /** When provided, shows an edit button that calls back with this entry. */
  onEdit?: (entry: Entry) => void;
  /** When provided, shows a delete button that calls back with this entry. */
  onDelete?: (entry: Entry) => void;
  /** When provided, checklist items render as tickable checkboxes that save immediately, without opening edit. */
  onToggleChecklistItem?: (entry: Entry, field: EntryField, itemIndex: number) => void;
  /** When provided, shows a button that opens this entry's version history. */
  onHistory?: (entry: Entry) => void;
  /** When provided, shows an archive button (or restore-from-archive, for an archived entry). */
  onArchive?: (entry: Entry) => void;
  /** When provided, shows a checkbox for picking this entry, e.g. to archive several at once. */
  selected?: boolean;
  onSelect?: (entry: Entry, selected: boolean) => void;
}

export default function EntryCard({
  entry,
  projectName,
  fields = [],
  showProject = false,
  onEdit,
  onDelete,
  onToggleChecklistItem,
  onHistory,
  onArchive,
  selected = false,
  onSelect,
}: EntryCardProps) {
  // Entries still queued on this device have no server history or archive state yet.
  const isQueued = entry.id.startsWith("offline-");
  const isArchived = Boolean(entry.archivedAt);
  const entryDate = new Date(entry.createdAt);
  const timeStr = entryDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Compute overdue: dueDate is in the past and entry exists
  const isOverdue = entry.dueDate ? new Date(entry.dueDate) < new Date(new Date().toDateString()) : false;

  const displayFields = entry.format?.fields?.length ? entry.format.fields : fields;
  const displayValue = (type: string, value: unknown) => {
    if (type === "BOOLEAN") return value ? "Yes" : "No";
    if (type === "TAGS") return Array.isArray(value) ? value.join(", ") : String(value);
    return String(value);
  };

  return (
    <div className={`border rounded-lg p-3 transition ${
      isOverdue
        ? "border-red-200 bg-red-50/40 hover:bg-red-50"
        : "border-slate-200 hover:bg-slate-50/50"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {onSelect && !isQueued && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(entry, e.target.checked)}
              className="rounded"
              aria-label="Select entry"
            />
          )}
          {isArchived && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <Archive className="h-3 w-3" />
              Archived
            </span>
          )}
          {showProject && projectName && (
            <Link
              to={`/projects/${entry.projectId}`}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition"
            >
              {projectName}
            </Link>
          )}
          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <Clock className="h-3 w-3 text-slate-400" />
            {formatDuration(entry.durationMinutes)}
          </span>
          {isOverdue && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-400">{timeStr}</span>
          {onHistory && !isQueued && (
            <button
              type="button"
              onClick={() => onHistory(entry)}
              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
              aria-label="Entry history"
              title="Version history"
            >
              <History className="h-3.5 w-3.5" />
            </button>
          )}
          {onArchive && !isQueued && (
            <button
              type="button"
              onClick={() => onArchive(entry)}
              className={`p-1 rounded-md transition ${
                isArchived
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
              }`}
              aria-label={isArchived ? "Restore entry from archive" : "Archive entry"}
              title={isArchived ? "Restore from archive" : "Archive entry"}
            >
              {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
              aria-label="Edit entry"
              title="Edit entry"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(entry)}
              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
              aria-label="Delete entry"
              title="Delete entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {displayFields.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {displayFields.map((field) => {
            const value = entry.values?.[field.id];

            if (field.type === "CHECKLIST") {
              const items = Array.isArray(value) ? (value as ChecklistItem[]) : [];
              if (items.length === 0) return null;
              return (
                <div key={field.id} className="text-xs">
                  <span className="text-slate-400">{field.name}</span>
                  <div className="mt-0.5 space-y-1">
                    {items.map((item, i) => (
                      <label
                        key={i}
                        className={`flex items-center gap-2 ${onToggleChecklistItem ? "cursor-pointer" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={!onToggleChecklistItem}
                          onChange={() => onToggleChecklistItem?.(entry, field, i)}
                          className="rounded"
                        />
                        <span className={item.checked ? "line-through text-slate-400" : "text-slate-800"}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            }

            if (isEmptyValue(value) && value !== false) return null;

            return (
              <div key={field.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{field.name}:</span>{" "}
                {field.type === "LINK" ? (
                  <a
                    href={String(value)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-blue-600 hover:underline break-all"
                  >
                    {String(value)}
                  </a>
                ) : field.type === "REFERENCE" && value && typeof value === "object" ? (
                  <Link
                    to={`/projects/${(value as { id: string; label?: string }).id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {(value as { id: string; label?: string }).label || (value as { id: string }).id}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800">
                    {displayValue(field.type, value)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TagList tags={entry.tags} className="mt-2" />

      {entry.dueDate && (
        <p className={`mt-1.5 text-[11px] font-medium ${
          isOverdue ? "text-red-600" : "text-amber-600"
        }`}>
          Due: {new Date(entry.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {isOverdue && " — overdue"}
        </p>
      )}
    </div>
  );
}
