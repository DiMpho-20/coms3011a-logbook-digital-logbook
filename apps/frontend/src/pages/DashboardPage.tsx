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
import { formatDuration, getGreeting } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import DeadlineReminders from "../components/DeadlineReminders";
import LoadingState from "../components/LoadingState";

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

        const results = await Promise.all(
          active.map(async (p) => {
            const [fields, entries] = await Promise.all([
              fetchEntryFields(p.id),
              fetchEntries(p.id),
            ]);
            return { projectId: p.id, fields, entries };
          })
        );

        if (cancelled) return;
        const fMap: Record<string, EntryField[]> = {};
        let combined: Entry[] = [];
        results.forEach((r) => {
          fMap[r.projectId] = r.fields;
          combined = combined.concat(r.entries);
        });
        setFieldsByProject(fMap);
        setAllEntries(combined);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        if (!cancelled) setLoading(false);
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
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      days.push({ label, dateKey: key, value: 0 });
    }
    allEntries.forEach((e) => {
      const key = (e.entryDate || e.createdAt).slice(0, 10);
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

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── 1. Greeting ─────────────────────────────────────────────────── */}
      <PageHeader
        title={`${getGreeting()}, ${displayName} \u{1F44B}`}
        subtitle="Here's what you've been working on."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                const firstActive = projects.find((p) => p.status === "ACTIVE");
                navigate(firstActive ? `/projects/${firstActive.id}` : "/projects");
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" /> New Entry
            </button>
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          </div>
        }
      />

      {/* ── 2. Key Statistics ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={FolderKanban} label="Active Projects" value={stats.activeCount} color="blue" />
        <StatCard icon={ListChecks} label="Entries This Week" value={stats.weekCount} color="emerald" />
        <StatCard icon={Clock} label="Total Time Logged" value={formatDuration(stats.totalMinutes)} color="orange" />
      </div>

      {/* ── Deadline Reminders ─────────────────────────────────────────── */}
      <DeadlineReminders entries={allEntries} projectNames={projectNames} />

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

      {/* ── 4. Recent Entries ───────────────────────────────────────────── */}
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
                className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition"
              >
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
