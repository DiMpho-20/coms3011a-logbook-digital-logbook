import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search, Clock, CalendarDays, Flame, ListChecks, FolderKanban,
  Check, X, Loader2,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  createEntry,
  type Project,
  type EntryField,
  type Entry,
  type EntryFieldValue,
} from "./api";

// ---------- helpers ----------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateHeading(dateKey: string): string {
  const date = new Date(dateKey + "T00:00:00");
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (dateKey === today) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function computeStreak(dateKeys: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!dateKeys.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateKeys.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function defaultValuesForFields(fields: EntryField[]): Record<string, EntryFieldValue> {
  const values: Record<string, EntryFieldValue> = {};
  fields.forEach((f) => {
    if (f.type === "DATE") values[f.id] = todayISO();
    else if (f.type === "BOOLEAN") values[f.id] = false;
    else values[f.id] = "";
  });
  return values;
}

function isEmptyValue(v: EntryFieldValue): boolean {
  return v === "" || v === undefined || v === null;
}

// ---------- component ----------

export default function EntryBrowser() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // quick capture state
  const [captureProjectId, setCaptureProjectId] = useState<string>("");
  const [captureDuration, setCaptureDuration] = useState<string>("");
  const [captureValues, setCaptureValues] = useState<Record<string, EntryFieldValue>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const durationInputRef = useRef<HTMLInputElement>(null);
  const captureFormRef = useRef<HTMLFormElement>(null);

  // browse state
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

      const fieldsMap: Record<string, EntryField[]> = {};
      let combined: Entry[] = [];
      results.forEach((r) => {
        fieldsMap[r.projectId] = r.fields;
        combined = combined.concat(r.entries);
      });

      setFieldsByProject(fieldsMap);
      setAllEntries(combined);

      setCaptureProjectId((prev) =>
        prev && active.some((p) => p.id === prev) ? prev : active[0]?.id || ""
      );
    } catch (err) {
      console.error("Failed to load entry browser data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // reset the capture form whenever the target project (or its schema) changes
  useEffect(() => {
    const fields = fieldsByProject[captureProjectId] || [];
    setCaptureValues(defaultValuesForFields(fields));
    setCaptureDuration("");
    setCaptureError(null);
  }, [captureProjectId, fieldsByProject]);

  // global shortcut: press "n" anywhere (outside a field) to jump to quick capture
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (!isTyping && e.key.toLowerCase() === "n") {
        e.preventDefault();
        durationInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCaptureFieldChange = (fieldId: string, value: EntryFieldValue) => {
    setCaptureValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmitCapture = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!captureProjectId) return;

    const minutes = parseInt(captureDuration, 10);
    if (!minutes || minutes <= 0) {
      setCaptureError("Enter how long this took, in minutes.");
      durationInputRef.current?.focus();
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
      const newEntry = await createEntry(captureProjectId, {
        durationMinutes: minutes,
        values: captureValues,
      });
      setAllEntries((prev) => [newEntry, ...prev]);
      setCaptureValues(defaultValuesForFields(fields));
      setCaptureDuration("");
      durationInputRef.current?.focus();
    } catch (err) {
      console.error("Failed to save entry:", err);
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

  // ---------- derived data ----------

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name || "Unknown project",
    [projects]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const weekEntries = allEntries.filter((e) => new Date(e.createdAt) >= weekAgo);
    const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

    const dateKeys = new Set(allEntries.map((e) => e.createdAt.slice(0, 10)));
    const streak = computeStreak(dateKeys);

    const minutesByProject: Record<string, number> = {};
    allEntries.forEach((e) => {
      minutesByProject[e.projectId] = (minutesByProject[e.projectId] || 0) + (e.durationMinutes || 0);
    });
    const topProjects = Object.entries(minutesByProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const maxProjectMinutes = topProjects.length > 0 ? topProjects[0][1] : 1;

    return {
      weekCount: weekEntries.length,
      weekMinutes,
      streak,
      topProjects,
      maxProjectMinutes,
    };
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    let list = [...allEntries];
    if (filterProjectId !== "all") {
      list = list.filter((e) => e.projectId === filterProjectId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => {
        const name = projectName(e.projectId).toLowerCase();
        const valuesStr = Object.values(e.values || {})
          .map((v) => String(v))
          .join(" ")
          .toLowerCase();
        return name.includes(q) || valuesStr.includes(q);
      });
    }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [allEntries, filterProjectId, searchQuery, projectName]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    filteredEntries.forEach((e) => {
      const key = e.createdAt.slice(0, 10);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  const captureFields = fieldsByProject[captureProjectId] || [];

  // ---------- render ----------

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Loading entries...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-blue-900 tracking-tight">Entry Browser</h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Log and browse your work</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center text-center">
          <div className="p-3 bg-blue-50 rounded-2xl mb-3">
            <FolderKanban className="h-6 w-6 text-[#0084D4]" />
          </div>
          <p className="text-sm font-bold text-slate-700">No active projects yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Create a project in Project Management first, then entries logged
            against it will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-blue-900 tracking-tight">Entry Browser</h1>
        <p className="text-xs font-medium text-slate-500 mt-0.5">
          Log what you just did, then browse and search everything you've logged
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-blue-50 p-2 rounded-xl">
            <ListChecks className="h-4 w-4 text-[#0084D4]" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{stats.weekCount}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">This Week</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-emerald-50 p-2 rounded-xl">
            <Clock className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{formatDuration(stats.weekMinutes)}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Time This Week</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-orange-50 p-2 rounded-xl">
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{stats.streak}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Day Streak</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-xl">
            <CalendarDays className="h-4 w-4 text-slate-500" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{allEntries.length}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Entries</p>
          </div>
        </div>
      </div>

      {/* Time by project */}
      {stats.topProjects.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Time by Project</p>
          <div className="space-y-2.5">
            {stats.topProjects.map(([projectId, minutes]) => (
              <div key={projectId} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 w-32 truncate shrink-0">
                  {projectName(projectId)}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0084D4] rounded-full"
                    style={{ width: `${(minutes / stats.maxProjectMinutes) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 w-14 text-right shrink-0">
                  {formatDuration(minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick capture */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-blue-900">Log an entry</h2>
          <span className="text-[10px] font-bold text-slate-400">
            press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">N</kbd> to jump here ·{" "}
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">Ctrl/Cmd+Enter</kbd> to save
          </span>
        </div>

        <form ref={captureFormRef} onSubmit={handleSubmitCapture} onKeyDown={handleFormKeyDown} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="w-52">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Project
              </label>
              <select
                value={captureProjectId}
                onChange={(e) => setCaptureProjectId(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Minutes spent
              </label>
              <input
                ref={durationInputRef}
                type="number"
                min={1}
                placeholder="e.g. 45"
                value={captureDuration}
                onChange={(e) => setCaptureDuration(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
              />
            </div>

            {captureFields.map((field) => (
              <div key={field.id} className={field.type === "BOOLEAN" ? "w-40 flex flex-col justify-end" : "w-48"}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  {field.name}
                  {field.required && <span className="text-red-500"> *</span>}
                </label>

                {field.type === "TEXT" && (
                  <input
                    type="text"
                    value={(captureValues[field.id] as string) || ""}
                    onChange={(e) => handleCaptureFieldChange(field.id, e.target.value)}
                    className="w-full border rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                  />
                )}

                {field.type === "NUMBER" && (
                  <input
                    type="number"
                    value={(captureValues[field.id] as number | string) ?? ""}
                    onChange={(e) => handleCaptureFieldChange(field.id, e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                  />
                )}

                {field.type === "DATE" && (
                  <input
                    type="date"
                    value={(captureValues[field.id] as string) || ""}
                    onChange={(e) => handleCaptureFieldChange(field.id, e.target.value)}
                    className="w-full border rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                  />
                )}

                {field.type === "BOOLEAN" && (
                  <label className="flex items-center gap-2 h-[34px] px-2 border rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!captureValues[field.id]}
                      onChange={(e) => handleCaptureFieldChange(field.id, e.target.checked)}
                    />
                    <span className="text-xs text-slate-600">Yes</span>
                  </label>
                )}
              </div>
            ))}
          </div>

          {captureError && (
            <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
              <X className="h-3 w-3" /> {captureError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-[#0084D4] hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Entry
            </button>
          </div>
        </form>
      </div>

      {/* Browse / timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <h2 className="text-sm font-black text-blue-900">Timeline</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="border rounded-lg p-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#0084D4]"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-2 border rounded-lg text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4] w-52"
              />
            </div>
          </div>
        </div>

        <div className="p-4">
          {groupedByDate.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500 font-medium">No entries match.</p>
              {(searchQuery || filterProjectId !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterProjectId("all");
                  }}
                  className="text-xs text-[#0084D4] font-bold hover:underline mt-1"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByDate.map(([dateKey, entries]) => (
                <div key={dateKey}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                    {formatDateHeading(dateKey)}
                  </p>
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const fields = fieldsByProject[entry.projectId] || [];
                      return (
                        <div
                          key={entry.id}
                          className="border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#0084D4]">
                                {projectName(entry.projectId)}
                              </span>
                              <span className="flex items-center gap-1 text-xs font-bold text-slate-600">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatDuration(entry.durationMinutes)}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          {fields.length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                              {fields.map((field) => {
                                const value = entry.values?.[field.id];
                                if (isEmptyValue(value) && value !== false) return null;
                                return (
                                  <span key={field.id} className="text-xs text-slate-600">
                                    <span className="text-slate-400">{field.name}:</span>{" "}
                                    <span className="font-medium text-slate-700">
                                      {field.type === "BOOLEAN" ? (value ? "Yes" : "No") : String(value)}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
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
    </div>
  );
}
