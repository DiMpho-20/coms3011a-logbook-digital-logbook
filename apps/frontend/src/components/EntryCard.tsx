import { Clock, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { formatDuration, isEmptyValue } from "../lib/utils";
import TagList from "./TagList";
import type { Entry, EntryField } from "../api";

interface EntryCardProps {
  entry: Entry;
  projectName?: string;
  fields?: EntryField[];
  showProject?: boolean;
  /** When provided, shows an edit button that calls back with this entry. */
  onEdit?: (entry: Entry) => void;
  /** When provided, shows a delete button that calls back with this entry. */
  onDelete?: (entry: Entry) => void;
}

export default function EntryCard({
  entry,
  projectName,
  fields = [],
  showProject = false,
  onEdit,
  onDelete,
}: EntryCardProps) {
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
    if (type === "CHECKLIST") return Array.isArray(value) ? value.map((item: any) => `${item.checked ? "✓" : "○"} ${item.label}`).join(" · ") : String(value);
    if (type === "REFERENCE" && value && typeof value === "object") return (value as any).label || (value as any).id;
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
          {showProject && projectName && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {projectName}
            </span>
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {displayFields.map((field) => {
            const value = entry.values?.[field.id];
            if (isEmptyValue(value) && value !== false) return null;
            return (
              <span key={field.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{field.name}:</span>{" "}
                <span className="font-medium text-slate-800">
                  {displayValue(field.type, value)}
                </span>
              </span>
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
