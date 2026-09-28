import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, Flame, ListChecks, Clock, CalendarDays, FolderKanban, AlertTriangle, ArrowUpDown, BookmarkPlus, X } from "lucide-react";

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
  computeStreak,
  entryDateKey,
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

function valueForSearch(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueForSearch).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(valueForSearch).join(" ");
  }
  return String(value ?? "");
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

  // Browse state
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "week" | "overdue">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  // Archived entries are left out unless asked for (US30).
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("exclude");

  // Saved filters (persisted to localStorage)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");

  // Guards against an earlier load's results landing after a later one's.
  const loadRunRef = useRef(0);

  const loadAll = useCallback(async () => {
    const run = ++loadRunRef.current;
    setLoading(true);
    setEntriesLoading(true);
    try {
      const all = await fetchProjects();
      if (run !== loadRunRef.current) return;
      const active = all.filter((p) => p.status === "ACTIVE");
      setProjects(active);
      setLoading(false);

      // First page only. More is fetched on demand via loadMore.
      const listing = await fetchAllEntries(

               {
          projectStatus: "ACTIVE",
          limit: PAGE_SIZE,
          offset: 0,
          ...(archivedFilter !== "exclude" && { archived: archivedFilter }),
        },

        { pendingProjectIds: active.map((p) => p.id) }
      );
      if (run !== loadRunRef.current) return;
      setAllEntries(listing.entries);
      setFieldsByProject(listing.fieldsByProject);
      setHasMore(listing.truncated);

      if (listing.projectsNeedingFields.length > 0) {
        const settled = await Promise.allSettled(
          listing.projectsNeedingFields.map(async (id) => ({ id, fields: await fetchEntryFields(id) }))
        );
        if (run !== loadRunRef.current) return;
        const extra: Record<string, EntryField[]> = {};
        settled.forEach((r) => {
          if (r.status === "fulfilled") extra[r.value.id] = r.value.fields;
        });
        const failed = settled.filter((r) => r.status === "rejected");
        failed.forEach((r) => console.error("Failed to load a project's fields:", (r as PromiseRejectedResult).reason));
        setLoadFailures(failed.length);
        setFieldsByProject((prev) => ({ ...prev, ...extra }));
      }
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      if (run === loadRunRef.current) {
        setLoading(false);
        setEntriesLoading(false);
      }
    }
  }, [archivedFilter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const listing = await fetchAllEntries(
        { projectStatus: "ACTIVE", limit: PAGE_SIZE, offset: allEntries.length },
        { pendingProjectIds: projects.map((p) => p.id) }
      );
      setAllEntries((prev) => [...prev, ...listing.entries]);
      setFieldsByProject((prev) => ({ ...prev, ...listing.fieldsByProject }));
      setHasMore(listing.truncated);
    } catch (err) {
      console.error("Failed to load more entries:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allEntries.length, projects]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setSavedFilters(loadSavedFilters());
  }, []);

  useEffect(() => {
    fetchTags().then((t) => setAvailableTags(t.map((tag) => tag.name))).catch(() => {});
  }, []);

  const filtersActive =
    searchQuery.trim() !== "" || filterProjectId !== "all" || filterTab !== "all" || tagFilters.length > 0;

  const applySavedFilter = (f: SavedFilter) => {
    setSearchQuery(f.searchQuery);
    setFilterProjectId(f.filterProjectId);
    setFilterTab(f.filterTab);
    setSortOrder(f.sortOrder);
    setTagFilters(f.selectedTags ?? []);
    setActiveFilterId(f.id);
    setShowSaveInput(false);
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

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const weekEntries = allEntries.filter((e) => new Date(e.createdAt) >= weekAgo);
    const weekMinutes = weekEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);
    const dateKeys = new Set(allEntries.map((e) => entryDateKey(e)));
    const streak = computeStreak(dateKeys);

    const today = new Date(new Date().toDateString());
    const overdueCount = allEntries.filter(
      (e) => e.dueDate && new Date(e.dueDate) < today
    ).length;

    return { weekCount: weekEntries.length, weekMinutes, streak, total: allEntries.length, overdueCount };
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    let list = [...allEntries];
    const today = new Date(new Date().toDateString());

    if (filterTab === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      list = list.filter((e) => new Date(e.createdAt) >= weekAgo);
    } else if (filterTab === "overdue") {
      list = list.filter((e) => e.dueDate && new Date(e.dueDate) < today);
    }

    if (filterProjectId !== "all") {
      list = list.filter((e) => e.projectId === filterProjectId);
    }
    if (tagFilters.length > 0) {
      list = list.filter((e) => (e.tags || []).some((t) => tagFilters.includes(t)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => {
        const name = projectName(e.projectId).toLowerCase();
        const vals = Object.values(e.values || {}).map(valueForSearch).join(" ").toLowerCase();
        const tagText = (e.tags || []).join(" ").toLowerCase();
        return name.includes(q) || vals.includes(q) || tagText.includes(q);
      });
    }
    if (filterTab === "overdue") {
      list.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    } else if (sortOrder === "oldest") {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [allEntries, filterTab, filterProjectId, tagFilters, searchQuery, projectName, sortOrder]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    filteredEntries.forEach((e) => {
      const key = entryDateKey(e);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

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
          {loadFailures === 1
            ? "One project's field list couldn't be loaded, so some older entries may show fewer details."
            : `${loadFailures} projects' field lists couldn't be loaded, so some older entries may show fewer details.`}
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
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterProjectId}
              onChange={(e) => {
                markManualChange();
                setFilterProjectId(e.target.value);
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
              <option value="overdue">
                Overdue{stats.overdueCount > 0 ? ` (${stats.overdueCount})` : ""}
              </option>
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
              ) : groupedByDate.length === 0 ? (
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
                  {groupedByDate.map(([dateKey, entries]) => (
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
                            entry.dueDate &&
                            new Date(entry.dueDate) < new Date(new Date().toDateString());

                          const descField = fields.find((f) => f.type === "TEXT");
                          const description = descField
                            ? (entry.values?.[descField.id] as string) || ""
                            : "";

                          // Collect non-empty custom-field values. The description
                          // field is skipped while
                          // it is showing as the headline — repeating the same text
                          // directly underneath it adds nothing.
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