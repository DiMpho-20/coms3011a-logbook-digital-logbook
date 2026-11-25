import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FolderKanban, CircleAlert } from "lucide-react";

import { formatDuration } from "../lib/utils";
import { lastProjectId } from "../lib/quickCapture";
import { button } from "../lib/ui";
import PageHeader from "../components/PageHeader";
import Stat from "../components/Stat";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useEntryFilters } from "./entries/useEntryFilters";
import { useEntriesData } from "./entries/useEntriesData";
import FilterBar from "./entries/FilterBar";
import FilterSummary from "./entries/FilterSummary";
import EntryList from "./entries/EntryList";

/**
 * The entries listing: one page of the logbook at a time, filtered by the
 * student and grouped by day.
 *
 * The page owns no filtering logic of its own. `useEntryFilters` holds the
 * draft and the applied snapshot, `useEntriesData` fetches what the applied
 * snapshot asks for, and the three sections below only render.
 */
export default function EntriesPage() {
  const navigate = useNavigate();
  const filters = useEntryFilters();
  const data = useEntriesData(filters.applied);

  const projectName = useCallback(
    (id: string) => data.projects.find((p) => p.id === id)?.name || "Unknown",
    [data.projects]
  );

  // The existing quick-capture route: the new-entry form on a project page.
  const logEntry = () => {
    const remembered = lastProjectId();
    const id =
      (filters.projectId !== "all" ? filters.projectId : null) ??
      (remembered && data.projects.some((p) => p.id === remembered) ? remembered : null) ??
      data.projects[0]?.id;
    navigate(id ? `/projects/${id}?new=1` : "/projects");
  };

  if (data.loading) {
    // The page's shape while the projects load: header, stats, filters, a day of entries.
    return (
      <div className="space-y-6 max-w-5xl" aria-busy="true">
        <span className="sr-only" role="status">Loading entries...</span>
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stat = (label: string, value: string | number, hint: string) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <Stat
        label={<span className="uppercase tracking-wider text-[11px]">{label}</span>}
        value={data.entriesLoading ? <Skeleton className="h-6 w-16 align-middle" /> : value}
        hint={hint}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Entries"
        subtitle="What you did and when, day by day."
        action={
          <button onClick={logEntry} className={button("primary")} disabled={data.loading}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Log an entry
          </button>
        }
      />

      {/* Four figures from the server's own counts; two by two until there's room for a row. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("This week", data.stats.weekCount, data.stats.weekCount === 1 ? "entry" : "entries")}
        {stat("Time this week", formatDuration(data.stats.weekMinutes), "logged")}
        {stat("Streak", `${data.stats.streak} ${data.stats.streak === 1 ? "day" : "days"}`, "in a row")}
        {stat("All time", data.stats.total, data.stats.total === 1 ? "entry logged" : "entries logged")}
      </div>

      {data.loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Some project field lists couldn't be loaded.
        </p>
      )}

      {data.projectsFailed ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            compact
            icon={CircleAlert}
            title="Your projects couldn't be loaded"
            description="Entries are listed by project, so they can't be shown yet. Check your connection and try again."
            action={<button onClick={data.loadProjects} className={button("secondary", "sm")}>Try again</button>}
          />
        </div>
      ) : data.projects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            compact
            icon={FolderKanban}
            title="No active projects"
            description="Create a project first, then entries will show up here."
            action={<Link to="/projects" className={button("secondary", "sm")}>Go to Projects</Link>}
          />
        </div>
      ) : (
        <>
          <FilterBar filters={filters} projects={data.projects} fieldsByProject={data.fieldsByProject} />
          <FilterSummary filters={filters} fieldsByProject={data.fieldsByProject} />
          <EntryList
            entries={data.allEntries}
            sort={filters.applied.sort}
            loading={data.entriesLoading}
            failed={data.entriesFailed}
            hasMore={data.hasMore}
            loadingMore={data.loadingMore}
            appliedFiltersActive={filters.appliedFiltersActive}
            appliedTab={filters.applied.tab}
            fieldsByProject={data.fieldsByProject}
            listingFields={data.listingFields}
            projectName={projectName}
            onRetry={data.reload}
            onClearFilters={filters.clearFilters}
            onLogEntry={logEntry}
            onLoadMore={data.loadMore}
          />
        </>
      )}
    </div>
  );
}
