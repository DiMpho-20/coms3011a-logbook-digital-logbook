import { Link } from "react-router-dom";
import { Archive, CalendarClock, CheckCircle2, ArrowRight } from "lucide-react";

import type { Entry, EntryField } from "../../api";
import { formatDuration } from "../../lib/utils";
import StatusChip from "../../components/StatusChip";
import TagList from "../../components/TagList";
import { entryTitle, fieldValueLabel, isEmptyFieldValue, shortDate } from "./filters";

/**
 * One entry in the day it belongs to: how long, what it was, where and when,
 * then whatever else the project asked for. The whole value set is here, so
 * an entry is never summarised into losing the field someone searches for.
 */
export default function EntryRow({
  entry,
  fields,
  projectName,
}: {
  entry: Entry;
  /** The entry's own format snapshot where it has one, else the project's fields. */
  fields: EntryField[];
  projectName: string;
}) {
  const { title, fieldId } = entryTitle(entry, fields);
  const otherFields = fields.filter((f) => f.id !== fieldId && !isEmptyFieldValue(entry.values?.[f.id]));
  const isQueued = entry.id.startsWith("offline-");
  // Only entries with a due date carry a status worth showing: they're open work.
  const isOverdue =
    entry.status === "OPEN" &&
    entry.dueDate &&
    new Date(entry.dueDate) < new Date(new Date().toDateString());
  const time = new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const viewHref = isQueued
    ? `/projects/${entry.projectId}`
    : `/projects/${entry.projectId}?entry=${entry.id}`;

  return (
    <li className="px-5 py-4 sm:grid sm:grid-cols-[5.5rem_1fr_auto] sm:gap-4">
      <p className="mb-1 text-sm font-semibold tabular-nums text-slate-900 sm:mb-0 sm:pt-px">
        <span className="sr-only">Duration </span>
        <span>{formatDuration(entry.durationMinutes)}</span>
      </p>

      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug text-slate-900 break-words">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          <span>{projectName}</span>
          <span aria-hidden="true"> · </span>
          <span className="tabular-nums">{time}</span>
        </p>

        {otherFields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {otherFields.map((field) => {
              const value = entry.values?.[field.id];
              if (field.type === "CHECKLIST" && Array.isArray(value)) {
                return (
                  <div key={field.id} className="basis-full">
                    <span className="text-slate-400">{field.name}</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {(value as { label: string; checked: boolean }[]).map((item, index) => (
                        <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                          <span aria-hidden="true" className={item.checked ? "text-emerald-600" : "text-slate-400"}>
                            {item.checked ? "✓" : "○"}
                          </span>
                          <span className="sr-only">{item.checked ? "Done: " : "Not done: "}</span>
                          <span className={item.checked ? "line-through text-slate-400" : "text-slate-700"}>
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              if (field.type === "LINK") {
                return (
                  <a
                    key={field.id}
                    href={String(value)}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-full break-all text-blue-600 hover:underline"
                  >
                    {String(value)}
                  </a>
                );
              }
              return (
                <span key={field.id} className="max-w-full break-words">
                  {field.type !== "BOOLEAN" && <span className="text-slate-400">{field.name} </span>}
                  <span>{fieldValueLabel(field, value)}</span>
                </span>
              );
            })}
          </div>
        )}

        <TagList tags={entry.tags} className="mt-2" />

        {(entry.archivedAt || entry.dueDate) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {entry.archivedAt && <StatusChip icon={Archive}>Archived</StatusChip>}
            {entry.dueDate && (
              <span className="inline-flex flex-wrap items-center gap-x-1.5 text-slate-600">
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Due {shortDate(entry.dueDate)}</span>
                {entry.status === "DONE" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <span aria-hidden="true">·</span>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Completed
                  </span>
                ) : (
                  <>
                    {isOverdue && (
                      <span className="font-medium text-amber-700">
                        <span aria-hidden="true">· </span>Overdue
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <Link to="/open-work" className="font-medium text-blue-600 hover:text-blue-700">
                      Open work<span aria-hidden="true"> →</span>
                    </Link>
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 sm:mt-0 sm:pt-px">
        <Link
          to={viewHref}
          className="group inline-flex min-h-[2rem] items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          aria-label={`View entry: ${title}`}
        >
          View entry
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
