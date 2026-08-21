import { useState, useEffect, useMemo } from "react";
import {
  FolderKanban, Clock, ListChecks, TrendingUp, Loader2,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchEntries,
  type Project,
  type Entry,
} from "./api";

// ── helpers ──────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── component ────────────────────────────────────────────────────────────

interface Props {
  projects: Project[];
}

export default function DashboardView({ projects }: Props) {
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = projects.filter((p) => p.status === "ACTIVE");
        const nameMap: Record<string, string> = {};
        projects.forEach((p) => { nameMap[p.id] = p.name; });
        setProjectNames(nameMap);

        const results = await Promise.all(
          active.map(async (p) => {
            const entries = await fetchEntries(p.id);
            return entries;
          })
        );
        if (!cancelled) {
          setAllEntries(results.flat());
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projects]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const weekEntries = allEntries.filter((e) => new Date(e.createdAt) >= weekAgo);
    const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
    const totalMinutes = allEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

    const minutesByProject: Record<string, number> = {};
    allEntries.forEach((e) => {
      minutesByProject[e.projectId] = (minutesByProject[e.projectId] || 0) + (e.durationMinutes || 0);
    });
    const topProjects = Object.entries(minutesByProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxProjectMinutes = topProjects.length > 0 ? topProjects[0][1] : 1;

    return {
      activeCount: projects.filter((p) => p.status === "ACTIVE").length,
      archivedCount: projects.filter((p) => p.status === "ARCHIVED").length,
      totalEntries: allEntries.length,
      weekCount: weekEntries.length,
      weekMinutes,
      totalMinutes,
      topProjects,
      maxProjectMinutes,
    };
  }, [allEntries, projects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-[#0084D4]" />
        <span className="ml-2 text-sm text-slate-500">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-blue-900 tracking-tight">Dashboard</h1>
        <p className="text-xs font-medium text-slate-500 mt-0.5">
          Overview of your logbook activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-blue-50 p-2 rounded-xl">
            <FolderKanban className="h-4 w-4 text-[#0084D4]" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{stats.activeCount}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Projects</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-emerald-50 p-2 rounded-xl">
            <ListChecks className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{stats.weekCount}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Entries This Week</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-orange-50 p-2 rounded-xl">
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{formatDuration(stats.weekMinutes)}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Time This Week</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <div className="bg-purple-50 p-2 rounded-xl">
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{formatDuration(stats.totalMinutes)}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Time</p>
          </div>
        </div>
      </div>

      {/* Time by project */}
      {stats.topProjects.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-4">
            Time by Project
          </p>
          <div className="space-y-3">
            {stats.topProjects.map(([projectId, minutes]) => (
              <div key={projectId} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 w-36 truncate shrink-0">
                  {projectNames[projectId] || "Unknown"}
                </span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0084D4] rounded-full"
                    style={{ width: `${(minutes / stats.maxProjectMinutes) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 w-16 text-right shrink-0">
                  {formatDuration(minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-4">
          Recent Activity
        </p>
        {allEntries.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No entries yet. Start logging work to see activity here.
          </p>
        ) : (
          <div className="space-y-2">
            {[...allEntries]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#0084D4]">
                      {projectNames[entry.projectId] || "Unknown"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDuration(entry.durationMinutes)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
