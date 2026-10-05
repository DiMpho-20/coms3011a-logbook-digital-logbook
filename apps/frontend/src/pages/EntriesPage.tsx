import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, Flame, ListChecks, Clock, CalendarDays, FolderKanban, AlertTriangle, ArrowUpDown, BookmarkPlus, X, Filter } from "lucide-react";

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
  saveFilter,
  deleteFilter,
  type SavedFilter,
} from "../lib/savedFilters";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import LoadingState from "../components/LoadingState";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import TagList from "../components/TagList";
import TagFilterBar from "../components/TagFilterBar";

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

export default function EntriesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
  console.log("EntriesPage mounted");
  return () => console.log("EntriesPage unmounted");
}, []);

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

  // ── Load projects + fields (only on mount) ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const all = await fetchProjects();
        const active = all.filter((p) => p.status === "ACTIVE");
        setProjects(active);

        const fieldResults = await Promise.all(
          active.map(async (p) => ({ id: p.id, fields: await fetchEntryFields(p.id).catch(() => []) }))
        );
        const map: Record<string, EntryField[]> = {};
        fieldResults.forEach((r) => { map[r.id] = r.fields; });
        setFieldsByProject(map);
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    })();
  }, []);

  // ── Load entries when the applied snapshot changes ─────────────────────
  const loadAll = useCallback(async (snapshot: typeof applied) => {
    const run = ++loadRunRef.current;
    if (!hasLoadedOnceRef.current) setLoading(true);
    setEntriesLoading(true);
    try {
      const listing = await fetchAllEntries(buildQuery(0, snapshot), {
        pendingProjectIds: projects.map((p) => p.id),
      });
      if (run !== loadRunRef.current) return;
      setAllEntries(listing.entries);
      setHasMore(listing.truncated);
      if (listing.stats) setStats(listing.stats);
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      if (run === loadRunRef.current) {
        setLoading(false);
        setEntriesLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [buildQuery, projects]);

  // Re-fetch whenever the applied snapshot changes, and after projects
  // are loaded for the first time.
  useEffect(() => {
    if (projects.length === 0 && !hasLoadedOnceRef.current) return;
    loadAll(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, projects.length]);

  useEffect(() => {
    setSavedFilters(loadSavedFilters());
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

  const handleSaveFilter = () => {
    if (!filterName.trim()) return;
    setSavedFilters(
      saveFilter(filterName, {
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
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(deleteFilter(id));
    if (activeFilterId === id) setActiveFilterId(null);
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

  if (loading) return <LoadingState message="Loading entries..." />;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Entries"
        subtitle="Everything you've recorded across your projects."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={ListChecks} label="This Week" value={stats.weekCount} color="blue" loading={entriesLoading} />
        <StatCard icon={Clock} label="Time This Week" value={formatDuration(stats.weekMinutes)} color="emerald" loading={entriesLoading} />
        <StatCard icon={Flame} label="Day Streak" value={stats.streak} color="orange" loading={entriesLoading} />
        <StatCard icon={CalendarDays} label="Total Entries" value={stats.total} color="slate" loading={entriesLoading} />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdueCount} color="red" loading={entriesLoading} />
      </div>

      {loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Some project field lists couldn't be loaded.
        </p>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No active projects"
          description="Create a project first, then entries will show up here."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => {
                  markManualChange();
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterProjectId}
              onChange={(e) => {
                markManualChange();
                setFilterProjectId(e.target.value);
                setFieldFilters([]);
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterTab}
              onChange={(e) => {
                markManualChange();
                setFilterTab(e.target.value as "all" | "week" | "overdue");
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Entries</option>
              <option value="week">This Week</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={archivedFilter}
              onChange={(e) => setArchivedFilter(e.target.value as ArchivedFilter)}
              aria-label="Archived entries"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="exclude">Active entries</option>
              <option value="include">Include archived</option>
              <option value="only">Archived only</option>
            </select>
            <button
              onClick={() => {
                markManualChange();
                setSortOrder((s) => (s === "newest" ? "oldest" : "newest"));
              }}
              className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 transition"
              title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </button>

            {/* Field filter button */}
            <div className="relative">
              <button
                onClick={() => setShowFilterPopover((v) => !v)}
                disabled={filterProjectId === "all"}
                title={filterProjectId === "all" ? "Pick a project first" : "Filter by a custom field"}
                className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Filter className="h-3.5 w-3.5" />
                Field filter
              </button>
              {showFilterPopover && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-4 w-80 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Field</label>
                    <select
                      value={newFilterFieldId}
                      onChange={(e) => {
                        setNewFilterFieldId(e.target.value);
                        setNewFilterOp("");
                        setNewFilterValue("");
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
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
                      <select
                        value={newFilterOp}
                        onChange={(e) => setNewFilterOp(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      >
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
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowFilterPopover(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">
                      Cancel
                    </button>
                    <button
                      onClick={addFieldFilter}
                      disabled={!newFilterFieldId || !newFilterOp}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40"
                    >
                      Add filter
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Search button — applies every draft filter at once. */}
            <button
              onClick={applySearch}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>

            {filtersActive && (
              <button
                onClick={() => setShowSaveInput((v) => !v)}
                className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 transition"
                title="Save the current filter combination"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Save
              </button>
            )}
          </div>

          {/* Active field filter chips */}
          {fieldFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Filters</span>
              {fieldFilters.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200"
                >
                  {describeFieldFilter(f)}
                  <button
                    onClick={() => removeFieldFilter(i)}
                    className="p-0.5 rounded-full hover:bg-blue-200 transition"
                    title="Remove this filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <TagFilterBar
            tags={availableTags}
            selected={tagFilters}
            onChange={(tags) => {
              markManualChange();
              setTagFilters(tags);
            }}
          />

          {showSaveInput && filtersActive && (
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                autoFocus
                placeholder="Name this filter (e.g. Lab work, overdue)"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveFilter();
                  if (e.key === "Escape") setShowSaveInput(false);
                }}
                className="flex-1 min-w-[200px] max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSaveFilter}
                disabled={!filterName.trim()}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Save filter
              </button>
              <button
                onClick={() => {
                  setShowSaveInput(false);
                  setFilterName("");
                }}
                className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            </div>
          )}

          {savedFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Saved
              </span>
              {savedFilters.map((f) => {
                const isActive = activeFilterId === f.id;
                return (
                  <span
                    key={f.id}
                    className={`group inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                      isActive
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
                    }`}
                    title={`Apply "${f.name}"`}
                  >
                    <button onClick={() => applySavedFilter(f)}>
                      {f.name}
                    </button>
                    <button
                      onClick={() => handleDeleteFilter(f.id)}
                      className={`p-0.5 rounded-full transition ${
                        isActive
                          ? "hover:bg-blue-500"
                          : "hover:bg-slate-100 text-slate-400 hover:text-red-500"
                      }`}
                      title={`Delete "${f.name}"`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-6">
              {entriesLoading ? (
                <div className="py-4 space-y-4" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-40" />
                      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : allEntries.length === 0 ? (
                <div className="text-center py-12">
                  {filterTab === "overdue" ? (
                    <>
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
                        <AlertTriangle className="h-5 w-5 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-700">All caught up!</p>
                      <p className="text-xs text-slate-400 mt-1">No overdue entries.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-400">No entries match.</p>
                      {filtersActive && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setFilterProjectId("all");
                            setFilterTab("all");
                            setTagFilters([]);
                            setFieldFilters([]);
                            setActiveFilterId(null);
                          }}
                          className="text-xs text-blue-600 font-medium hover:underline mt-2"
                        >
                          Clear filters
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {groupEntriesByDate(allEntries).map(([dateKey, entries]) => (
                    <div key={dateKey}>
                      <div className="border-b border-slate-100 pb-2 mb-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {formatDateHeading(dateKey)}
                        </p>
                      </div>

                      <div className="relative ml-3">
                        <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-200" />

                        {entries.map((entry) => {
                          const time = new Date(entry.createdAt);
                          const timeStr = time.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const fields = entry.format?.fields?.length
                            ? entry.format.fields
                            : fieldsByProject[entry.projectId] || [];
                          const isOverdue =
                            entry.status === "OPEN" &&
                            entry.dueDate &&
                            new Date(entry.dueDate) < new Date(new Date().toDateString());

                          const descField = fields.find((f) => f.type === "TEXT");
                          const description = descField
                            ? (entry.values?.[descField.id] as string) || ""
                            : "";

                          const fieldValues = fields
                            .filter((f) => {
                              if (description && f.id === descField?.id) return false;
                              const v = entry.values?.[f.id];
                              return !isEmptyFieldValue(v);
                            });

                          return (
                            <div key={entry.id} className="relative pl-8 pb-6 last:pb-0">
                              <div
                                className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 -translate-x-[5px] ${
                                  isOverdue
                                    ? "bg-red-500 border-red-200"
                                    : "bg-blue-500 border-blue-200"
                                }`}
                              />

                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="text-xs font-medium text-slate-400">
                                    {timeStr}
                                  </span>
                                  <span className="text-xs font-medium text-slate-500">
                                    {formatDuration(entry.durationMinutes)}
                                  </span>
                                  {entry.archivedAt && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                      Archived
                                    </span>
                                  )}
                                </div>

                                {description && (
                                  <p className="text-sm font-medium text-slate-800 mb-1">
                                    {description}
                                  </p>
                                )}

                                <p className="text-xs text-slate-500 mb-1.5">
                                  {projectName(entry.projectId)}
                                </p>

                                {fieldValues.length > 0 && (
                                  <div className="mt-1.5 space-y-1">
                                    {fieldValues.map((field) => {
                                      const value = entry.values?.[field.id];

                                      if (field.type === "CHECKLIST" && Array.isArray(value)) {
                                        return (
                                          <div key={field.id} className="text-xs text-slate-600">
                                            <span className="text-slate-400">{field.name}</span>
                                            <ul className="mt-0.5 space-y-0.5">
                                              {(value as { label: string; checked: boolean }[]).map((item, index) => (
                                                <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                                                  <span className={item.checked ? "text-emerald-600" : "text-slate-400"}>
                                                    {item.checked ? "✓" : "○"}
                                                  </span>
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
                                            className="inline-flex max-w-full px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-blue-700 border border-slate-200 hover:underline break-all"
                                          >
                                            {String(value)}
                                          </a>
                                        );
                                      }

                                      return (
                                        <span
                                          key={field.id}
                                          className="inline-flex max-w-full px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 break-words"
                                        >
                                          {fieldValueLabel(field, value)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                <TagList tags={entry.tags} className="mt-1" />

                                {isOverdue && (
                                  <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                    <AlertTriangle className="h-3 w-3" />
                                    Overdue
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-50"
                      >
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Group a flat list of entries by their visible date, newest first.
function groupEntriesByDate(entries: Entry[]): [string, Entry[]][] {
  const groups: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    const key = (e.entryDate || e.createdAt).slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}