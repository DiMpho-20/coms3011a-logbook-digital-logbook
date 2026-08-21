import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  ListChecks,
  Clock,
  TrendingUp,
  Plus,
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
import EntryCard from "../components/EntryCard";
import LoadingState from "../components/LoadingState";

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
        const nameMap: Record<string, string> = {};
        data.forEach((p) => {
          nameMap[p.id] = p.name;
        });
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

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const weekEntries = allEntries.filter((e) => new Date(e.createdAt) >= weekAgo);
    const weekMinutes = weekEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);
    const totalMinutes = allEntries.reduce((s, e) => s + (e.durationMinutes || 0), 0);

    return {
      activeCount: projects.filter((p) => p.status === "ACTIVE").length,
      weekCount: weekEntries.length,
      weekMinutes,
      totalMinutes,
    };
  }, [allEntries, projects]);

  const recentEntries = useMemo(
    () => [...allEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    [allEntries]
  );

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "ACTIVE"),
    [projects]
  );

  const projectTimeData = useMemo(() => {
    const map: Record<string, number> = {};
    allEntries.forEach((e) => {
      map[e.projectId] = (map[e.projectId] || 0) + (e.durationMinutes || 0);
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [allEntries]);

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  const maxProjectMinutes = projectTimeData.length > 0 ? projectTimeData[0][1] : 1;

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <PageHeader
        title={`${getGreeting()}, ${displayName}`}
        subtitle="Here's what's happening with your projects."
        action={
          <button
            onClick={() => navigate("/entries")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <Plus className="h-4 w-4" /> New Entry
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FolderKanban} label="Active Projects" value={stats.activeCount} color="blue" />
        <StatCard icon={ListChecks} label="Entries This Week" value={stats.weekCount} color="emerald" />
        <StatCard icon={Clock} label="Time This Week" value={formatDuration(stats.weekMinutes)} color="orange" />
        <StatCard icon={TrendingUp} label="Total Time" value={formatDuration(stats.totalMinutes)} color="purple" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Activity — 3/5 width */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
          </div>
          <div className="p-4">
            {recentEntries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                No entries yet. Start logging work to see activity here.
              </p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    projectName={projectNames[entry.projectId]}
                    fields={fieldsByProject[entry.projectId] || []}
                    showProject
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Projects Overview — 2/5 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active projects */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Active Projects</h2>
              <button
                onClick={() => navigate("/projects")}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View all
              </button>
            </div>
            <div className="p-4">
              {activeProjects.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No active projects.</p>
              ) : (
                <div className="space-y-2">
                  {activeProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full flex items-center justify-between py-2 px-2 -mx-2 rounded-md hover:bg-slate-50 transition text-left"
                    >
                      <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                      <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                        {formatDuration(
                          projectTimeData.find(([id]) => id === p.id)?.[1] || 0
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Time by project */}
          {projectTimeData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-3">
                Time by Project
              </h3>
              <div className="space-y-2.5">
                {projectTimeData.map(([projectId, minutes]) => (
                  <div key={projectId} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-700 w-28 truncate shrink-0">
                      {projectNames[projectId] || "Unknown"}
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(minutes / maxProjectMinutes) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-14 text-right shrink-0">
                      {formatDuration(minutes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
