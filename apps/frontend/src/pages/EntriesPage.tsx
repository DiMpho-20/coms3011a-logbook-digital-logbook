import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Flame, ListChecks, Clock, CalendarDays, FolderKanban, AlertTriangle, ArrowUpDown } from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  type Project,
  type EntryField,
  type Entry,
} from "../api";
import {
  formatDuration,
  formatDateHeading,
  computeStreak,
} from "../lib/utils";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import LoadingState from "../components/LoadingState";
import EmptyState from "../components/EmptyState";

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => {
        const name = projectName(e.projectId).toLowerCase();
        const vals = Object.values(e.values || {}).map((v) => String(v)).join(" ").toLowerCase();
        return name.includes(q) || vals.includes(q);
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
  }, [allEntries, filterTab, filterProjectId, searchQuery, projectName, sortOrder]);

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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
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
              onChange={(e) => setFilterTab(e.target.value as "all" | "week" | "overdue")}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Entries</option>
              <option value="week">This Week</option>
              <option value="overdue">
                Overdue{stats.overdueCount > 0 ? ` (${stats.overdueCount})` : ""}
              </option>
            </select>
            <button
              onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
              className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 transition"
              title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </button>
          </div>

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
                      {(searchQuery || filterProjectId !== "all") && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setFilterProjectId("all");
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

                          // Collect non-empty field values as tags
                          const tags = fields
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

                                {tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {tags.map((tag, i) => (
                                      <span
                                        key={i}
                                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

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
