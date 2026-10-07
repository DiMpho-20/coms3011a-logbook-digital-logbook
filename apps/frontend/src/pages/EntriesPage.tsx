import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, FolderKanban, BookmarkPlus, X, Filter, Plus, NotebookPen, ArrowRight, Archive,
  CalendarClock, CheckCircle2, ChevronDown, SearchX, CircleAlert,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchAllEntries,
  fetchTags,
  type ArchivedFilter,
  type Project,
  type EntryField,
  type Entry,
} from "../api";
import {
  formatDuration,
  formatDateHeading,
} from "../lib/utils";
import {
  loadSavedFilters,
  syncSavedFilters,
  saveFilter,
  deleteFilter,
  type SavedFilter,
} from "../lib/savedFilters";
import PageHeader from "../components/PageHeader";
import Stat from "../components/Stat";
import StatusChip from "../components/StatusChip";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import TagList from "../components/TagList";
import TagFilterBar from "../components/TagFilterBar";
import { lastProjectId } from "../lib/quickCapture";
import { button, inputClass } from "../lib/ui";

const PAGE_SIZE = 20;

type FieldFilter = { fieldId: string; op: string; value: string };

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  TEXT: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "equals" },
  ],
  NUMBER: [
    { value: "equals", label: "=" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
  ],
  BOOLEAN: [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
  ],
  DATE: [
    { value: "on", label: "on" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
  ],
  TAGS: [
    { value: "has_tag", label: "has tag" },
  ],
};

function isEmptyFieldValue(value: unknown) {
  return value == null || value === "" || value === false || (Array.isArray(value) && value.length === 0);
}

function fieldValueLabel(field: EntryField, value: unknown): string {
  if (field.type === "BOOLEAN") return field.name;
  if (field.type === "TAGS" && Array.isArray(value)) return value.join(", ");
  if (field.type === "REFERENCE" && value && typeof value === "object") {
    const reference = value as { id?: string; label?: string };
    return reference.label || reference.id || "";
  }
  return String(value);
}

/** The line that names an entry: its first text field, else its first filled-in value. */
function entryTitle(entry: Entry, fields: EntryField[]): { title: string; fieldId: string | null } {
  const descField = fields.find((f) => f.type === "TEXT");
  const description = descField ? (entry.values?.[descField.id] as string) || "" : "";
  if (description) return { title: description, fieldId: descField!.id };
  return { title: "Untitled entry", fieldId: null };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const selectClass =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export default function EntriesPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  // The newest format each project's listed entries were written in, as sent with the entries.
  const [listingFields, setListingFields] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState(0);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entriesFailed, setEntriesFailed] = useState(false);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({ total: 0, weekCount: 0, weekMinutes: 0, overdueCount: 0, streak: 0 });

  // Draft filter state — the user edits these freely.
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "week" | "overdue">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("exclude");
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);

  // Applied snapshot — only updated when the user clicks Search (or presses Enter).
  const [applied, setApplied] = useState({
    search: "",
    projectId: "all",
    tab: "all" as "all" | "week" | "overdue",
    sort: "newest" as "newest" | "oldest",
    tags: [] as string[],
    archived: "exclude" as ArchivedFilter,
    fieldFilters: [] as FieldFilter[],
  });

  // Field filter popover state
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [newFilterFieldId, setNewFilterFieldId] = useState("");
  const [newFilterOp, setNewFilterOp] = useState("");
  const [newFilterValue, setNewFilterValue] = useState("");

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");

  const loadRunRef = useRef(0);

  // Fields of the selected project (for the field filter popover).
  const selectedProjectFields = useMemo<EntryField[]>(() => {
    if (filterProjectId === "all") return [];
    return fieldsByProject[filterProjectId] || [];
  }, [filterProjectId, fieldsByProject]);

  const currentField: EntryField | undefined = selectedProjectFields.find((f) => f.id === newFilterFieldId);
  const availableOps = currentField ? OPERATORS_BY_TYPE[currentField.type] || [] : [];

  // ── Build query from applied snapshot ──────────────────────────────────
  const buildQuery = useCallback((offset: number, snapshot: typeof applied) => {
    const query: Record<string, unknown> = {
      projectStatus: "ACTIVE",
      limit: PAGE_SIZE,
      offset,
      entryTab: snapshot.tab,
      sort: snapshot.sort,
    };
    if (snapshot.projectId !== "all") query.projectId = snapshot.projectId;
    if (snapshot.search.trim()) query.search = snapshot.search.trim();
    if (snapshot.tags.length > 0) query.tags = snapshot.tags.join(",");
    if (snapshot.archived !== "exclude") query.archived = snapshot.archived;
    if (snapshot.fieldFilters.length > 0) query.filters = JSON.stringify(snapshot.fieldFilters);
    return query;
  }, []);

  // ── Load projects + fields (on mount, and again on "Try again") ───────
  const loadProjects = useCallback(async () => {
    setProjectsFailed(false);
    try {
      const all = await fetchProjects();
      const active = all.filter((p) => p.status === "ACTIVE");
      setProjects(active);
      setProjectsLoaded(true);
      setLoading(false);

      let failures = 0;
      const fieldResults = await Promise.all(
        active.map(async (p) => ({
          id: p.id,
          fields: await fetchEntryFields(p.id).catch(() => {
            failures += 1;
            return [] as EntryField[];
          }),
        }))
      );
      const map: Record<string, EntryField[]> = {};
      fieldResults.forEach((r) => { map[r.id] = r.fields; });
      setFieldsByProject(map);
      setLoadFailures(failures);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setProjectsFailed(true);
      setProjectsLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ── Load entries when the applied snapshot changes ─────────────────────
  const loadAll = useCallback(async (snapshot: typeof applied) => {
    const run = ++loadRunRef.current;
    setEntriesLoading(true);
    setEntriesFailed(false);
    try {
      const listing = await fetchAllEntries(buildQuery(0, snapshot), {
        pendingProjectIds: projects.map((p) => p.id),
      });
      if (run !== loadRunRef.current) return;
      setAllEntries(listing.entries);
      setListingFields(listing.fieldsByProject);
      setHasMore(listing.truncated);
      if (listing.stats) setStats(listing.stats);
    } catch (err) {
      console.error("Failed to load entries:", err);
      if (run === loadRunRef.current) setEntriesFailed(true);
    } finally {
      if (run === loadRunRef.current) setEntriesLoading(false);
    }
  }, [buildQuery, projects]);

  // Re-fetch whenever the applied snapshot changes, and once the projects
  // have loaded (even when there are none, so the spinner clears).
  useEffect(() => {
    if (!projectsLoaded) return;
    loadAll(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, projectsLoaded]);

  useEffect(() => {
    // The cached copy at once, then the account's list (which also uploads
    // any filter saved only on this device).
    setSavedFilters(loadSavedFilters());
    syncSavedFilters().then(setSavedFilters).catch(() => {});
  }, []);

  useEffect(() => {
    fetchTags().then((t) => setAvailableTags(t.map((tag) => tag.name))).catch(() => {});
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────
  const applySearch = () => {
    setApplied({
      search: searchQuery,
      projectId: filterProjectId,
      tab: filterTab,
      sort: sortOrder,
      tags: tagFilters,
      archived: archivedFilter,
      fieldFilters,
    });
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const listing = await fetchAllEntries(buildQuery(allEntries.length, applied), {
        pendingProjectIds: projects.map((p) => p.id),
      });
      setAllEntries((prev) => [...prev, ...listing.entries]);
      setListingFields((prev) => ({ ...listing.fieldsByProject, ...prev }));
      setHasMore(listing.truncated);
    } catch (err) {
      console.error("Failed to load more entries:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allEntries.length, projects, applied, buildQuery]);

  const filtersActive =
    searchQuery.trim() !== "" ||
    filterProjectId !== "all" ||
    filterTab !== "all" ||
    tagFilters.length > 0 ||
    fieldFilters.length > 0;

  // Filters that live behind the "Filters" button, counted for its badge.
  const advancedCount =
    (filterTab !== "all" ? 1 : 0) + (archivedFilter !== "exclude" ? 1 : 0) + tagFilters.length + fieldFilters.length;
  const appliedFiltersActive =
    applied.search.trim() !== "" ||
    applied.projectId !== "all" ||
    applied.tab !== "all" ||
    applied.tags.length > 0 ||
    applied.archived !== "exclude" ||
    applied.fieldFilters.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterProjectId("all");
    setFilterTab("all");
    setTagFilters([]);
    setFieldFilters([]);
    setArchivedFilter("exclude");
    setActiveFilterId(null);
    setApplied((prev) => ({
      ...prev,
      search: "",
      projectId: "all",
      tab: "all",
      tags: [],
      archived: "exclude",
      fieldFilters: [],
    }));
  };

  // The existing quick-capture route: the new-entry form on a project page.
  const logEntry = () => {
    const remembered = lastProjectId();
    const id =
      (filterProjectId !== "all" ? filterProjectId : null) ??
      (remembered && projects.some((p) => p.id === remembered) ? remembered : null) ??
      projects[0]?.id;
    navigate(id ? `/projects/${id}?new=1` : "/projects");
  };

  const applySavedFilter = (f: SavedFilter) => {
    setSearchQuery(f.searchQuery);
    setFilterProjectId(f.filterProjectId);
    setFilterTab(f.filterTab);
    setSortOrder(f.sortOrder);
    setTagFilters(f.selectedTags ?? []);
    setArchivedFilter((f.archivedFilter ?? "exclude") as ArchivedFilter);
    setFieldFilters(f.fieldFilters ?? []);
    setActiveFilterId(f.id);
    setShowSaveInput(false);
    // Saved filters apply immediately.
    setApplied({
      search: f.searchQuery,
      projectId: f.filterProjectId,
      tab: f.filterTab,
      sort: f.sortOrder,
      tags: f.selectedTags ?? [],
      archived: (f.archivedFilter ?? "exclude") as ArchivedFilter,
      fieldFilters: f.fieldFilters ?? [],
    });
  };

  const markManualChange = () => setActiveFilterId(null);

  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    try {
      setSavedFilters(
        await saveFilter(filterName, {
          searchQuery,
          filterProjectId,
          filterTab,
          sortOrder,
          selectedTags: tagFilters,
          archivedFilter,
          fieldFilters,
        })
      );
      setFilterName("");
      setShowSaveInput(false);
    } catch (err) {
      console.error("Failed to save filter:", err);
    }
  };

  const handleDeleteFilter = async (id: string) => {
    try {
      setSavedFilters(await deleteFilter(id));
      if (activeFilterId === id) setActiveFilterId(null);
    } catch (err) {
      console.error("Failed to delete filter:", err);
    }
  };

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name || "Unknown",
    [projects]
  );

  const addFieldFilter = () => {
    if (!newFilterFieldId || !newFilterOp) return;
    const value = newFilterOp === "is_true" || newFilterOp === "is_false" ? "" : newFilterValue;
    setFieldFilters((prev) => [...prev, { fieldId: newFilterFieldId, op: newFilterOp, value }]);
    setNewFilterFieldId("");
    setNewFilterOp("");
    setNewFilterValue("");
    setShowFilterPopover(false);
    markManualChange();
  };

  const removeFieldFilter = (index: number) => {
    setFieldFilters((prev) => prev.filter((_, i) => i !== index));
    markManualChange();
  };

  const describeFieldFilter = (f: FieldFilter): string => {
    const field = Object.values(fieldsByProject).flat().find((x) => x.id === f.fieldId);
    const fieldName = field?.name || "Field";
    const opLabel = OPERATORS_BY_TYPE[field?.type || "TEXT"]?.find((o) => o.value === f.op)?.label || f.op;
    if (f.op === "is_true" || f.op === "is_false") return `${fieldName} ${opLabel}`;
    return `${fieldName} ${opLabel} "${f.value}"`;
  };

  const header = (
    <PageHeader
      title="Entries"
      subtitle="What you did and when, day by day."
      action={
        <button onClick={logEntry} className={button("primary")} disabled={loading}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Log an entry
        </button>
      }
    />
  );

  if (loading) {
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
        value={entriesLoading ? <Skeleton className="h-6 w-16 align-middle" /> : value}
        hint={hint}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {header}

      {/* Four figures from the server's own counts; two by two until there's room for a row. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("This week", stats.weekCount, stats.weekCount === 1 ? "entry" : "entries")}
        {stat("Time this week", formatDuration(stats.weekMinutes), "logged")}
        {stat("Streak", `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`, "in a row")}
        {stat("All time", stats.total, stats.total === 1 ? "entry logged" : "entries logged")}
      </div>

      {loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Some project field lists couldn't be loaded.
        </p>
      )}

      {projectsFailed ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            compact
            icon={CircleAlert}
            title="Your projects couldn't be loaded"
            description="Entries are listed by project, so they can't be shown yet. Check your connection and try again."
            action={<button onClick={loadProjects} className={button("secondary", "sm")}>Try again</button>}
          />
        </div>
      ) : projects.length === 0 ? (
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
          {/* ── One filter bar: search, project, order; the rest behind Filters ── */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 p-2">
              <div className="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search entries..."
                  aria-label="Search entries"
                  value={searchQuery}
                  onChange={(e) => {
                    markManualChange();
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
                  className={`${inputClass} h-10 pl-9`}
                />
              </div>
              <select
                value={filterProjectId}
                aria-label="Project"
                onChange={(e) => {
                  markManualChange();
                  setFilterProjectId(e.target.value);
                  setFieldFilters([]);
                }}
                className={`${selectClass} min-w-0 flex-1 sm:flex-none sm:max-w-[200px]`}
              >
                <option value="all">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={sortOrder}
                aria-label="Sort order"
                onChange={(e) => {
                  markManualChange();
                  setSortOrder(e.target.value as "newest" | "oldest");
                }}
                className={`${selectClass} flex-1 sm:flex-none`}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-controls="entry-filters"
                className={`${button("secondary")} flex-1 sm:flex-none ${showFilters ? "bg-slate-50" : ""}`}
              >
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filters
                {advancedCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-1.5 text-xs font-semibold tabular-nums text-blue-700">
                    {advancedCount}<span className="sr-only"> active</span>
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${showFilters ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {/* Applies every draft filter at once, as it always has. */}
              <button onClick={applySearch} className={`${button("secondary")} flex-1 sm:flex-none`}>
                <Search className="h-4 w-4" aria-hidden="true" />
                Search
              </button>
            </div>

            {showFilters && (
              <div id="entry-filters" className="space-y-4 border-t border-slate-100 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Show</span>
                    <select
                      value={filterTab}
                      onChange={(e) => {
                        markManualChange();
                        setFilterTab(e.target.value as "all" | "week" | "overdue");
                      }}
                      className={`${selectClass} w-full`}
                    >
                      <option value="all">All entries</option>
                      <option value="week">This week</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Archive</span>
                    <select
                      value={archivedFilter}
                      onChange={(e) => {
                        markManualChange();
                        setArchivedFilter(e.target.value as ArchivedFilter);
                      }}
                      aria-label="Archived entries"
                      className={`${selectClass} w-full`}
                    >
                      <option value="exclude">Active entries</option>
                      <option value="include">Include archived</option>
                      <option value="only">Archived only</option>
                    </select>
                  </label>

                  {/* Field filter: a project's own fields, so it needs a project chosen. */}
                  <div className="relative">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Fields</span>
                    <button
                      onClick={() => setShowFilterPopover((v) => !v)}
                      disabled={filterProjectId === "all"}
                      aria-expanded={showFilterPopover}
                      className={`${button("secondary")} w-full justify-start`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Field filter
                    </button>
                    {filterProjectId === "all" && (
                      <p className="mt-1 text-xs text-slate-500">Choose a project to filter by its fields.</p>
                    )}
                    {showFilterPopover && (
                      <div className="absolute top-full left-0 z-20 mt-1 w-full min-w-[16rem] space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg sm:w-80">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Field</label>
                          <select
                            value={newFilterFieldId}
                            onChange={(e) => {
                              setNewFilterFieldId(e.target.value);
                              setNewFilterOp("");
                              setNewFilterValue("");
                            }}
                            className={inputClass}
                          >
                            <option value="">Choose a field…</option>
                            {selectedProjectFields.map((f) => (
                              <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                            ))}
                          </select>
                        </div>
                        {currentField && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Operator</label>
                            <select value={newFilterOp} onChange={(e) => setNewFilterOp(e.target.value)} className={inputClass}>
                              <option value="">Choose…</option>
                              {availableOps.map((op) => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {currentField !== undefined && newFilterOp && newFilterOp !== "is_true" && newFilterOp !== "is_false" && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
                            <input
                              type={currentField.type === "NUMBER" ? "number" : currentField.type === "DATE" ? "date" : "text"}
                              value={newFilterValue}
                              onChange={(e) => setNewFilterValue(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <button onClick={() => setShowFilterPopover(false)} className={button("ghost", "sm")}>
                            Cancel
                          </button>
                          <button
                            onClick={addFieldFilter}
                            disabled={!newFilterFieldId || !newFilterOp}
                            className={button("primary", "sm")}
                          >
                            Add filter
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <TagFilterBar
                  tags={availableTags}
                  selected={tagFilters}
                  onChange={(tags) => {
                    markManualChange();
                    setTagFilters(tags);
                  }}
                />
              </div>
            )}
          </div>

          {/* Active field filters stay visible with the panel closed, so nothing is filtered out of sight. */}
          {fieldFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-slate-500">Field filters</span>
              {fieldFilters.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200"
                >
                  {describeFieldFilter(f)}
                  <button
                    onClick={() => removeFieldFilter(i)}
                    className="rounded-full p-1 hover:bg-blue-100 transition-colors duration-150"
                    aria-label={`Remove filter: ${describeFieldFilter(f)}`}
                    title="Remove this filter"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {(filtersActive || savedFilters.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {savedFilters.length > 0 && <span className="text-xs font-medium text-slate-500">Saved</span>}
              {savedFilters.map((f) => {
                const isActive = activeFilterId === f.id;
                return (
                  <span
                    key={f.id}
                    className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border transition-colors duration-150 ${
                      isActive
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                    title={`Apply "${f.name}"`}
                  >
                    <button onClick={() => applySavedFilter(f)} aria-pressed={isActive}>
                      {f.name}
                    </button>
                    <button
                      onClick={() => handleDeleteFilter(f.id)}
                      className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors duration-150"
                      aria-label={`Delete saved filter ${f.name}`}
                      title={`Delete "${f.name}"`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
              {filtersActive && (
                <span className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setShowSaveInput((v) => !v)}
                    className={button("ghost", "sm")}
                    title="Save the current filter combination"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Save
                  </button>
                  <button onClick={clearFilters} className={button("ghost", "sm")}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear filters
                  </button>
                </span>
              )}
            </div>
          )}

          {showSaveInput && filtersActive && (
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                autoFocus
                placeholder="Name this filter (e.g. Lab work, overdue)"
                aria-label="Filter name"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveFilter();
                  if (e.key === "Escape") setShowSaveInput(false);
                }}
                className={`${inputClass} flex-1 min-w-[200px] max-w-sm`}
              />
              <button onClick={handleSaveFilter} disabled={!filterName.trim()} className={button("primary", "sm")}>
                Save filter
              </button>
              <button
                onClick={() => {
                  setShowSaveInput(false);
                  setFilterName("");
                }}
                className={button("ghost", "sm")}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── The logbook itself ─────────────────────────────────────────── */}
          <section aria-labelledby="entry-list-heading" className="rounded-xl border border-slate-200 bg-white">
            <h2 id="entry-list-heading" className="sr-only">Your entries</h2>
            {entriesLoading ? (
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
            ) : entriesFailed ? (
              <EmptyState
                compact
                icon={CircleAlert}
                title="Your entries couldn't be loaded"
                description="This is usually the connection. Your entries are safe; try again in a moment."
                action={<button onClick={() => loadAll(applied)} className={button("secondary", "sm")}>Try again</button>}
              />
            ) : allEntries.length === 0 ? (
              !appliedFiltersActive ? (
                <EmptyState
                  compact
                  icon={NotebookPen}
                  title="No entries yet"
                  description="Your work sessions will appear here once you start logging them."
                  action={
                    <button onClick={logEntry} className={button("primary")}>
                      <Plus className="h-4 w-4" aria-hidden="true" /> Log an entry
                    </button>
                  }
                />
              ) : applied.tab === "overdue" ? (
                <EmptyState
                  compact
                  icon={CheckCircle2}
                  title="All caught up."
                  description="No overdue entries."
                  action={<button onClick={clearFilters} className={button("secondary", "sm")}>Clear filters</button>}
                />
              ) : (
                <EmptyState
                  compact
                  icon={SearchX}
                  title="No entries match these filters."
                  description="Try a different search, or clear the filters to see everything."
                  action={<button onClick={clearFilters} className={button("secondary", "sm")}>Clear filters</button>}
                />
              )
            ) : (
              <div>
                {groupEntriesByDate(allEntries, applied.sort).map(([dateKey, entries]) => {
                  const dayMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
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
                        {entries.map((entry) => {
                          const fields = entry.format?.fields?.length
                            ? entry.format.fields
                            : listingFields[entry.projectId] || fieldsByProject[entry.projectId] || [];
                          const { title, fieldId } = entryTitle(entry, fields);
                          const otherFields = fields.filter(
                            (f) => f.id !== fieldId && !isEmptyFieldValue(entry.values?.[f.id])
                          );
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
                            <li key={entry.id} className="px-5 py-4 sm:grid sm:grid-cols-[5.5rem_1fr_auto] sm:gap-4">
                              <p className="mb-1 text-sm font-semibold tabular-nums text-slate-900 sm:mb-0 sm:pt-px">
                                <span className="sr-only">Duration </span>
                                <span>{formatDuration(entry.durationMinutes)}</span>
                              </p>

                              <div className="min-w-0">
                                <p className="text-[15px] font-semibold leading-snug text-slate-900 break-words">{title}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  <span>{projectName(entry.projectId)}</span>
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
                        })}
                      </ul>
                    </section>
                  );
                })}

                {hasMore && (
                  <div className="flex justify-center border-t border-slate-100 p-4">
                    <button onClick={loadMore} disabled={loadingMore} className={button("secondary", "sm")}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Group a flat list of entries by their visible date, days in the chosen order.
function groupEntriesByDate(entries: Entry[], sort: "newest" | "oldest" = "newest"): [string, Entry[]][] {
  const groups: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    const key = (e.entryDate || e.createdAt).slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return Object.entries(groups).sort((a, b) => (sort === "oldest" ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
}