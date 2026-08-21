import { Clock, AlertTriangle } from "lucide-react";
import { formatDuration, isEmptyValue } from "../lib/utils";
import type { Entry, EntryField } from "../api";

interface EntryCardProps {
  entry: Entry;
  projectName?: string;
  fields?: EntryField[];
  showProject?: boolean;
}

export default function EntryCard({
  entry,
  projectName,
  fields = [],
  showProject = false,
}: EntryCardProps) {
  const entryDate = new Date(entry.createdAt);
  const timeStr = entryDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Compute overdue: dueDate is in the past and entry exists
  const isOverdue = entry.dueDate ? new Date(entry.dueDate) < new Date(new Date().toDateString()) : false;

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
        <span className="text-[11px] text-slate-400 shrink-0">{timeStr}</span>
      </div>

      {fields.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {fields.map((field) => {
            const value = entry.values?.[field.id];
            if (isEmptyValue(value) && value !== false) return null;
            return (
              <span key={field.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{field.name}:</span>{" "}
                <span className="font-medium text-slate-800">
                  {field.type === "BOOLEAN" ? (value ? "Yes" : "No") : String(value)}
                </span>
              </span>
            );
          })}
        </div>
      )}

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
