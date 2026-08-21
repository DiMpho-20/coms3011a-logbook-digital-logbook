import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, Flame, ListChecks, Clock, CalendarDays, FolderKanban, AlertTriangle } from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  createEntry,
  type Project,
  type EntryField,
  type Entry,
  type EntryFieldValue,
} from "../api";
import {
  formatDuration,
  formatDateHeading,
  computeStreak,
  defaultValuesForFields,
  isEmptyValue,
  todayISO,
} from "../lib/utils";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import EntryCard from "../components/EntryCard";
import LoadingState from "../components/LoadingState";
import EmptyState from "../components/EmptyState";

export default function EntriesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick capture state
  const [captureProjectId, setCaptureProjectId] = useState("");
  const [captureDuration, setCaptureDuration] = useState("");
  const [captureDueDate, setCaptureDueDate] = useState("");
  const [captureValues, setCaptureValues] = useState<Record<string, EntryFieldValue>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Browse state
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "week" | "overdue">("all");

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

      setCaptureProjectId((prev) =>
        prev && active.some((p) => p.id === prev) ? prev : active[0]?.id || ""
      );
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Reset capture form when project changes
  useEffect(() => {
    const fields = fieldsByProject[captureProjectId] || [];
    setCaptureValues(defaultValuesForFields(fields));
    setCaptureDuration("");
    setCaptureDueDate("");
    setCaptureError(null);
  }, [captureProjectId, fieldsByProject]);

  // Keyboard shortcut: N to focus duration
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (!isTyping && e.key.toLowerCase() === "n") {
        e.preventDefault();
        durationRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFieldChange = (fieldId: string, value: EntryFieldValue) => {
    setCaptureValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmitCapture = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!captureProjectId) return;

    const minutes = parseInt(captureDuration, 10);
    if (!minutes || minutes <= 0) {
      setCaptureError("Enter how long this took, in minutes.");
      durationRef.current?.focus();
      return;
    }

    const fields = fieldsByProject[captureProjectId] || [];
    const missing = fields.find((f) => f.required && isEmptyValue(captureValues[f.id]));
    if (missing) {
      setCaptureError(`"${missing.name}" is required.`);
      return;
    }

    setCaptureError(null);
    setSubmitting(true);
    try {
      const entryData: {
        durationMinutes: number;
        values: Record<string, EntryFieldValue>;
        dueDate?: string;
      } = {
        durationMinutes: minutes,
        values: captureValues,
      };
      if (captureDueDate) entryData.dueDate = captureDueDate;

      const newEntry = await createEntry(captureProjectId, entryData);
      setAllEntries((prev) => [newEntry, ...prev]);
      const f = fieldsByProject[captureProjectId] || [];
      setCaptureValues(defaultValuesForFields(f));
      setCaptureDuration("");
      setCaptureDueDate("");
      durationRef.current?.focus();
    } catch {
      setCaptureError("Couldn't save that entry. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmitCapture();
    }
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => {
        const name = projectName(e.projectId).toLowerCase();
        const vals = Object.values(e.values || {}).map((v) => String(v)).join(" ").toLowerCase();
        return name.includes(q) || vals.includes(q);
      });
    }
    // Overdue entries sort by most overdue first; otherwise newest first
    if (filterTab === "overdue") {
      list.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [allEntries, filterTab, filterProjectId, searchQuery, projectName]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    filteredEntries.forEach((e) => {
      const key = e.entryDate || e.createdAt.slice(0, 10);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  const captureFields = fieldsByProject[captureProjectId] || [];

  if (loading) return <LoadingState message="Loading entries..." />;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Entries"
        subtitle="Log what you worked on and browse everything you've recorded."
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
          {/* Quick capture */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Log an entry</h2>
              <span className="text-[10px] text-slate-400">
                press{" "}
                <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">
                  N
                </kbd>{" "}
                to jump here
              </span>
            </div>

            <form
              ref={formRef}
              onSubmit={handleSubmitCapture}
              onKeyDown={handleFormKeyDown}
              className="space-y-3"
            >
              <div className="flex flex-wrap gap-3">
                <div className="w-48">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Project
                  </label>
                  <select
                    value={captureProjectId}
                    onChange={(e) => setCaptureProjectId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-32">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Minutes
                  </label>
                  <input
                    ref={durationRef}
                    type="number"
                    min={1}
                    placeholder="e.g. 45"
                    value={captureDuration}
                    onChange={(e) => setCaptureDuration(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="w-40">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={captureDueDate}
                    onChange={(e) => setCaptureDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {captureFields.map((field) => (
                  <div
                    key={field.id}
                    className={field.type === "BOOLEAN" ? "w-36 flex flex-col justify-end" : "w-44"}
                  >
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {field.type === "TEXT" && (
                      <input
                        type="text"
                        value={(captureValues[field.id] as string) || ""}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                    {field.type === "NUMBER" && (
                      <input
                        type="number"
                        value={(captureValues[field.id] as number | string) ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            field.id,
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                    {field.type === "DATE" && (
                      <input
                        type="date"
                        value={(captureValues[field.id] as string) || todayISO()}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                    {field.type === "BOOLEAN" && (
                      <label className="flex items-center gap-2 h-[38px] px-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={!!captureValues[field.id]}
                          onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-slate-600">Yes</span>
                      </label>
                    )}
                  </div>
                ))}
              </div>

              {captureError && (
                <p className="text-xs font-medium text-red-600">{captureError}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">
                    Ctrl+Enter
                  </kbd>{" "}
                  to save
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  {submitting ? (
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Save Entry"
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Timeline / Browse */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFilterTab("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filterTab === "all"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  All Entries
                </button>
                <button
                  onClick={() => setFilterTab("week")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filterTab === "week"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  This Week
                </button>
                <button
                  onClick={() => setFilterTab("overdue")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                    filterTab === "overdue"
                      ? "bg-red-600 text-white"
                      : stats.overdueCount > 0
                        ? "text-red-600 hover:bg-red-50"
                        : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Overdue
                  {stats.overdueCount > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      filterTab === "overdue"
                        ? "bg-white/20 text-white"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {stats.overdueCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search entries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52"
                  />
                </div>
              </div>
            </div>

            <div className="p-4">
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
                <div className="space-y-6">
                  {groupedByDate.map(([dateKey, entries]) => (
                    <div key={dateKey}>
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
                        {formatDateHeading(dateKey)}
                      </p>
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            projectName={projectName(entry.projectId)}
                            fields={fieldsByProject[entry.projectId] || []}
                            showProject
                          />
                        ))}
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
