import { Plus, NotebookPen, CheckCircle2, SearchX, CircleAlert } from "lucide-react";

import type { Entry, EntryField } from "../../api";
import { formatDateHeading, formatDuration } from "../../lib/utils";
import EmptyState from "../../components/EmptyState";
import Skeleton from "../../components/Skeleton";
import { button } from "../../lib/ui";
import { groupEntriesByDate } from "./filters";
import EntryRow from "./EntryRow";

/**
 * The logbook itself: entries grouped under the day they happened, in the
 * order asked for, with a plain state for each way the list can be empty.
 *
 * "Nothing yet", "all caught up" and "nothing matches" are three different
 * facts; saying the wrong one would send the student looking for a problem
 * that isn't there.
 */
export default function EntryList({
  entries,
  sort,
  loading,
  failed,
  hasMore,
  loadingMore,
  appliedFiltersActive,
  appliedTab,
  fieldsByProject,
  listingFields,
  projectName,
  onRetry,
  onClearFilters,
  onLogEntry,
  onLoadMore,
}: {
  entries: Entry[];
  sort: "newest" | "oldest";
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  appliedFiltersActive: boolean;
  appliedTab: "all" | "week" | "overdue";
  fieldsByProject: Record<string, EntryField[]>;
  listingFields: Record<string, EntryField[]>;
  projectName: (id: string) => string;
  onRetry: () => void;
  onClearFilters: () => void;
  onLogEntry: () => void;
  onLoadMore: () => void;
}) {
  return (
    <section aria-labelledby="entry-list-heading" className="rounded-xl border border-slate-200 bg-white">
      <h2 id="entry-list-heading" className="sr-only">Your entries</h2>
      {loading ? (
        <div className="p-5 space-y-6" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-3 w-40" />
              {[0, 1].map((j) => (
                <div key={j} className="flex gap-4">
                  <Skeleton className="h-4 w-14" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          compact
          icon={CircleAlert}
          title="Your entries couldn't be loaded"
          description="This is usually the connection. Your entries are safe; try again in a moment."
          action={<button onClick={onRetry} className={button("secondary", "sm")}>Try again</button>}
        />
      ) : entries.length === 0 ? (
        !appliedFiltersActive ? (
          <EmptyState
            compact
            icon={NotebookPen}
            title="No entries yet"
            description="Your work sessions will appear here once you start logging them."
            action={
              <button onClick={onLogEntry} className={button("primary")}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Log an entry
              </button>
            }
          />
        ) : appliedTab === "overdue" ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title="All caught up."
            description="No overdue entries."
            action={<button onClick={onClearFilters} className={button("secondary", "sm")}>Clear filters</button>}
          />
        ) : (
          <EmptyState
            compact
            icon={SearchX}
            title="No entries match these filters."
            description="Try a different search, or clear the filters to see everything."
            action={<button onClick={onClearFilters} className={button("secondary", "sm")}>Clear filters</button>}
          />
        )
      ) : (
        <div>
          {groupEntriesByDate(entries, sort).map(([dateKey, dayEntries]) => {
            const dayMinutes = dayEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
            const headingId = `day-${dateKey}`;
            return (
              <section key={dateKey} aria-labelledby={headingId} className="border-b border-slate-100 last:border-b-0 first:[&>h3]:rounded-t-xl">
                <h3
                  id={headingId}
                  className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {`${formatDateHeading(dateKey)} · ${formatDuration(dayMinutes)}`}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {dayEntries.map((entry) => {
                    // The entry's own snapshot wins: it is what the form showed.
                    const fields = entry.format?.fields?.length
                      ? entry.format.fields
                      : listingFields[entry.projectId] || fieldsByProject[entry.projectId] || [];
                    return (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        fields={fields}
                        projectName={projectName(entry.projectId)}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {hasMore && (
            <div className="flex justify-center border-t border-slate-100 p-4">
              <button onClick={onLoadMore} disabled={loadingMore} className={button("secondary", "sm")}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
