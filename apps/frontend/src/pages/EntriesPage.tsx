import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Flame, ListChecks, Clock, CalendarDays, FolderKanban, AlertTriangle, ArrowUpDown, BookmarkPlus, X } from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  fetchTags,
  type Project,
  type EntryField,
  type Entry,
} from "../api";
import {
  formatDuration,
  formatDateHeading,
  computeStreak,
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
import TagList from "../components/TagList";
import TagFilterBar from "../components/TagFilterBar";

export default function EntriesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Browse state
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "week" | "overdue">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Saved filters (persisted to localStorage)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchProjects();
      const active = all.filter((p) => p.status === "ACTIVE");
      setProjects(active);

      const results = await Promise.all(
        active.map(async (p) => {
          const [fields, entries] = await Promise.all([
            fetchEntryFields(p.id),
            fetchEntries(p.id),
          ]);
          return { projectId: p.id, fields, entries };
        })
      );

      const fMap: Record<string, EntryField[]> = {};
      let combined: Entry[] = [];
      results.forEach((r) => {
        fMap[r.projectId] = r.fields;
        combined = combined.concat(r.entries);
      });
      setFieldsByProject(fMap);
      setAllEntries(combined);
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Load saved filters once on mount
  useEffect(() => {
    setSavedFilters(loadSavedFilters());
  }, []);

  // Tags available to filter by
  useEffect(() => {
    fetchTags().then((t) => setAvailableTags(t.map((tag) => tag.name))).catch(() => {});
  }, []);

  // True when the current filter state differs from the defaults
  const filtersActive =
    searchQuery.trim() !== "" || filterProjectId !== "all" || filterTab !== "all" || tagFilters.length > 0;

  // Applying a saved filter restores every dimension of the saved view
  const applySavedFilter = (f: SavedFilter) => {
    setSearchQuery(f.searchQuery);
    setFilterProjectId(f.filterProjectId);
    setFilterTab(f.filterTab);
    setSortOrder(f.sortOrder);
    setTagFilters(f.selectedTags ?? []);
    setActiveFilterId(f.id);
    setShowSaveInput(false);
  };

  // Manual filter changes deselect the active chip — the view is no longer the saved one
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

  // Derived data
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
    const dateKeys = new Set(allEntries.map((e) => e.createdAt.slice(0, 10)));
    const streak = computeStreak(dateKeys);

    // Overdue: dueDate is before today (start of day)
    const today = new Date(new Date().toDateString());
    const overdueCount = allEntries.filter(
      (e) => e.dueDate && new Date(e.dueDate) < today
    ).length;

    return { weekCount: weekEntries.length, weekMinutes, streak, total: allEntries.length, overdueCount };
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    let list = [...allEntries];
    const today = new Date(new Date().toDateString());

    // Tab filter
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
        const vals = Object.values(e.values || {}).map((v) => String(v)).join(" ").toLowerCase();
        const tagText = (e.tags || []).join(" ").toLowerCase();
        return name.includes(q) || vals.includes(q) || tagText.includes(q);
      });
    }
    // Overdue entries sort by most overdue first; otherwise use sortOrder
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
      const key = e.entryDate || e.createdAt.slice(0, 10);
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={ListChecks} label="This Week" value={stats.weekCount} color="blue" />
        <StatCard icon={Clock} label="Time This Week" value={formatDuration(stats.weekMinutes)} color="emerald" />
        <StatCard icon={Flame} label="Day Streak" value={stats.streak} color="orange" />
        <StatCard icon={CalendarDays} label="Total Entries" value={stats.total} color="slate" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdueCount} color="red" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No active projects"
          description="Create a project first, then entries will show up here."
        />
      ) : (
        <>
          {/* Filter bar */}
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

          {/* Save-filter name input */}
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

          {/* Saved filter chips */}
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

          {/* Timeline */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-6">
              {groupedByDate.length === 0 ? (
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
                      {/* Date heading */}
                      <div className="border-b border-slate-100 pb-2 mb-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {formatDateHeading(dateKey)}
                        </p>
                      </div>

                      {/* Timeline entries */}
                      <div className="relative ml-3">
                        {/* Vertical line */}
                        <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-200" />

                        {entries.map((entry) => {
                          const time = new Date(entry.createdAt);
                          const timeStr = time.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const fields = fieldsByProject[entry.projectId] || [];
                          const isOverdue =
                            entry.dueDate &&
                            new Date(entry.dueDate) < new Date(new Date().toDateString());

                          // Collect non-empty field values as chips (distinct from entry.tags below)
                          const fieldChips = fields
                            .filter((f) => {
                              const v = entry.values?.[f.id];
                              return v != null && v !== "" && v !== false;
                            })
                            .map((f) => {
                              const v = entry.values?.[f.id];
                              return f.type === "BOOLEAN" ? f.name : String(v);
                            });

                          // Try to get a description from first TEXT field
                          const descField = fields.find((f) => f.type === "TEXT");
                          const description = descField
                            ? (entry.values?.[descField.id] as string) || ""
                            : "";

                          return (
                            <div key={entry.id} className="relative pl-8 pb-6 last:pb-0">
                              {/* Dot */}
                              <div
                                className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 -translate-x-[5px] ${
                                  isOverdue
                                    ? "bg-red-500 border-red-200"
                                    : "bg-blue-500 border-blue-200"
                                }`}
                              />

                              {/* Entry content */}
                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="text-xs font-medium text-slate-400">
                                    {timeStr}
                                  </span>
                                  <span className="text-xs font-medium text-slate-500">
                                    {formatDuration(entry.durationMinutes)}
                                  </span>
                                </div>

                                {description && (
                                  <p className="text-sm font-medium text-slate-800 mb-1">
                                    {description}
                                  </p>
                                )}

                                <p className="text-xs text-slate-500 mb-1.5">
                                  {projectName(entry.projectId)}
                                </p>

                                {fieldChips.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {fieldChips.map((chip, i) => (
                                      <span
                                        key={i}
                                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                      >
                                        {chip}
                                      </span>
                                    ))}
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
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
