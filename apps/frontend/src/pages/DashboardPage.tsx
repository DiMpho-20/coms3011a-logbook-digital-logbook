import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  ListChecks,
  Clock,
  Plus,
  FolderOpen,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  type Project,
  type Entry,
  type EntryField,
} from "../api";
import { formatDuration, getGreeting, localDateKey, entryDateKey } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import DeadlineReminders from "../components/DeadlineReminders";
import LoadingState from "../components/LoadingState";
import Skeleton from "../components/Skeleton";
import TagList from "../components/TagList";

// ── SVG Sparkline ────────────────────────────────────────────────────────
function ActivityChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-[160px] text-sm text-slate-400">
        No activity data yet
      </div>
    );
  }

  const width = 400;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 30, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.value / maxVal) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[160px]">
      <defs>
        <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartH * (1 - frac)}
          y2={padding.top + chartH * (1 - frac)}
          stroke="#e2e8f0"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="url(#activityFill)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={points[i].x}
          y={height - 6}
          textAnchor="middle"
          className="text-[10px] fill-slate-400"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function entrySummary(entry: Entry, fields: EntryField[]): string {
  // Try to find a text field value as the "description"
  for (const field of fields) {
    if (field.type === "TEXT") {
      const val = entry.values?.[field.id];
      if (val && typeof val === "string" && val.trim()) return val.trim();
    }
  }
  // Fallback: first non-empty value
  for (const field of fields) {
    const val = entry.values?.[field.id];
    if (val != null && val !== false && val !== "") {
      return field.type === "BOOLEAN" ? (val ? "Yes" : "No") : String(val);
    }
  }
  return "—";
}

function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Main Component ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [loading, setLoading] = useState(true);
  // Entries arrive one request per project, long after the projects
  // themselves. Sections that need them show a placeholder rather than
  // holding the whole page on a spinner.
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState(0);
  const [displayName] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("logbook-name") : null) || "Student"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProjects();
        const active = data.filter((p) => p.status === "ACTIVE");
        if (cancelled) return;
        setProjects(data);
        // The greeting, the project list and the active-project count only
        // need this much. Release the page here.
        setLoading(false);

        // Accumulate locally so a re-run of this effect can never append to
        // a previous run's results.
        const fMap: Record<string, EntryField[]> = {};
        const combined: Entry[] = [];

        const settled = await Promise.allSettled(
          active.map(async (p) => {
            const [fields, entries] = await Promise.all([
              fetchEntryFields(p.id),
              fetchEntries(p.id),
            ]);
            if (cancelled) return;
            // Publish each project as it lands so the list fills in
            // progressively instead of all at once at the end.
            fMap[p.id] = fields;
            combined.push(...entries);
            setFieldsByProject({ ...fMap });
            setAllEntries([...combined]);
          })
        );

        if (cancelled) return;
        // allSettled, not all: one unreachable project used to reject the
        // whole batch and leave the dashboard empty.
        const failed = settled.filter((r) => r.status === "rejected");
        failed.forEach((r) => console.error("Failed to load a project:", (r as PromiseRejectedResult).reason));
        setLoadFailures(failed.length);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setEntriesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const weekEntries = allEntries.filter((e) => new Date(e.createdAt) >= weekAgo);
    const totalMinutes = allEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);

    return {
      activeCount: projects.filter((p) => p.status === "ACTIVE").length,
      weekCount: weekEntries.length,
      totalMinutes,
    };
  }, [allEntries, projects]);

  // Activity chart: last 7 days
  const activityData = useMemo(() => {
    const days: { label: string; dateKey: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      days.push({ label, dateKey: key, value: 0 });
    }
    allEntries.forEach((e) => {
      const key = entryDateKey(e);
      const day = days.find((d) => d.dateKey === key);
      if (day) day.value += e.durationMinutes || 0;
    });
    return days;
  }, [allEntries]);

  // Current projects with time
  const projectTimeData = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === "ACTIVE");
    const timeMap: Record<string, number> = {};
    allEntries.forEach((e) => {
      timeMap[e.projectId] = (timeMap[e.projectId] || 0) + (e.durationMinutes || 0);
    });
    return activeProjects
      .map((p) => ({
        id: p.id,
        name: p.name,
        tags: p.tags,
        minutes: timeMap[p.id] || 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [projects, allEntries]);

  // Recent entries (last 8)
  const recentEntries = useMemo(
    () => [...allEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [allEntries]
  );

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  // Tag usage across every project and entry, most-used first.
  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => (p.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    allEntries.forEach((e) => (e.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [projects, allEntries]);

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── 1. Greeting ─────────────────────────────────────────────────── */}
      <PageHeader
        title={`${getGreeting()}, ${displayName} \u{1F44B}`}
        subtitle="Here's what you've been working on."
        action={
          <button
            onClick={() => navigate("/projects")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        }
      />

      {/* ── 2. Key Statistics ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={FolderKanban} label="Active Projects" value={stats.activeCount} color="blue" />
        <StatCard icon={ListChecks} label="Entries This Week" value={stats.weekCount} color="emerald" loading={entriesLoading} />
        <StatCard icon={Clock} label="Total Time Logged" value={formatDuration(stats.totalMinutes)} color="orange" loading={entriesLoading} />
      </div>

      {/* ── Deadline Reminders ─────────────────────────────────────────── */}
      {entriesLoading ? (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>
      ) : (
        <DeadlineReminders entries={allEntries} projectNames={projectNames} />
      )}

      {loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadFailures === 1
            ? "One project's entries couldn't be loaded, so the totals above are incomplete."
            : `${loadFailures} projects' entries couldn't be loaded, so the totals above are incomplete.`}
        </p>
      )}

      {/* ── 3. Activity + Projects ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Activity Chart — 3/5 */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Minutes logged — last 7 days</p>
          </div>
          <div className="p-4">
            <ActivityChart data={activityData} />
          </div>
        </div>

        {/* Current Projects — 2/5 */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Current Projects</h2>
            <button
              onClick={() => navigate("/projects")}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </button>
          </div>
          <div className="p-4">
            {projectTimeData.length === 0 ? (
              <div className="text-center py-8">
                <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No active projects.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectTimeData.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="w-full flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 transition text-left group"
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition">
                        {p.name}
                      </p>
                      <TagList tags={p.tags} className="mt-1" />
                    </div>
                    <span className="text-xs font-medium text-slate-500 shrink-0">
                      {formatDuration(p.minutes)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Tags ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
          <button
            onClick={() => navigate("/entries")}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Browse entries
          </button>
        </div>
        <div className="p-4">
          {tagStats.length === 0 ? (
            <p className="text-sm text-slate-400">
              No tags yet. Add a tag to a project or entry to see it here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tagStats.map((t) => (
                <span
                  key={t.name}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                >
                  {t.name}
                  <span className="px-1.5 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-blue-600">
                    {t.count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Recent Entries ───────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent Entries</h2>
          <button
            onClick={() => navigate("/entries")}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View all
          </button>
        </div>
        {recentEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-400">No entries yet. Start logging work to see activity here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3 hover:bg-slate-50/50 transition"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-medium text-slate-400 w-16 shrink-0">
                    {relativeDay(entry.entryDate || entry.createdAt)}
                  </span>
                  <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">
                    {entrySummary(entry, fieldsByProject[entry.projectId] || [])}
                  </span>
                  <span className="text-xs font-medium text-slate-600 shrink-0 w-16 text-right">
                    {formatDuration(entry.durationMinutes)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                    {projectNames[entry.projectId] || "Unknown"}
                  </span>
                </div>
                <TagList tags={entry.tags} className="mt-1.5 ml-[72px]" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
