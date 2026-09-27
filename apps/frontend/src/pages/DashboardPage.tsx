import { useState, useEffect, useMemo, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchAllEntries,
  type Project,
  type Entry,
  type EntryField,
} from "../api";
import { formatDuration, getGreeting, localDateKey, entryDateKey } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import DeadlineReminders from "../components/DeadlineReminders";
import LoadingState from "../components/LoadingState";
import Skeleton from "../components/Skeleton";
import TagList from "../components/TagList";
import Modal from "../components/Modal";
import {
  DASHBOARD_PANELS,
  loadDashboardPanels,
  saveDashboardPanels,
  type DashboardPanelId,
} from "../lib/dashboardPreferences";

const DASHBOARD_PANEL_DETAILS: Record<DashboardPanelId, { title: string; description: string }> = {

  "deadline-reminders": { title: "Deadline reminders", description: "Upcoming due dates from your entries" },
  activity: { title: "Activity", description: "A seven-day view of time logged" },
  "current-projects": { title: "Current projects", description: "Your active projects and their logged time" },
  tags: { title: "Tags", description: "Tags used in your projects and entries" },
  "recent-entries": { title: "Recent entries", description: "Your latest logbook entries" },
};

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
  const [truncated, setTruncated] = useState(false);
  const [selectedPanels, setSelectedPanels] = useState<DashboardPanelId[]>(loadDashboardPanels);
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [draftPanels, setDraftPanels] = useState<DashboardPanelId[]>(selectedPanels);
  const [arrangingPanels, setArrangingPanels] = useState(false);
  const [draggedPanel, setDraggedPanel] = useState<DashboardPanelId | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<DashboardPanelId | null>(null);
  const [displayName] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("logbook-name") : null) || "Student"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProjects();
        if (cancelled) return;
        setProjects(data);
        // The greeting, the project list and the active-project count only
        // need this much. Release the page here.
        setLoading(false);

        // One request for every active project's entries, rather than two
        // per project. 500 is the endpoint's cap.
        const listing = await fetchAllEntries(
          { projectStatus: "ACTIVE", limit: 500 },
          { pendingProjectIds: data.filter((p) => p.status === "ACTIVE").map((p) => p.id) }
        );
        if (cancelled) return;
        setAllEntries(listing.entries);
        setFieldsByProject(listing.fieldsByProject);
        setTruncated(listing.truncated);

        // Most entries carry their own format snapshot, which is all
        // EntryCard needs. Only projects with an entry that has none —
        // legacy entries, and anything still queued offline — need the
        // live field list as a fallback, so only those are fetched.
        if (listing.projectsNeedingFields.length > 0) {
          const settled = await Promise.allSettled(
            listing.projectsNeedingFields.map(async (id) => ({ id, fields: await fetchEntryFields(id) }))
          );
          if (cancelled) return;
          const extra: Record<string, EntryField[]> = {};
          settled.forEach((r) => {
            if (r.status === "fulfilled") extra[r.value.id] = r.value.fields;
          });
          const failed = settled.filter((r) => r.status === "rejected");
          failed.forEach((r) => console.error("Failed to load a project's fields:", (r as PromiseRejectedResult).reason));
          setLoadFailures(failed.length);
          // Live fields beat an older snapshot for the fallback case.
          setFieldsByProject((prev) => ({ ...prev, ...extra }));
        }
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

  const openPanelPicker = () => {
    setDraftPanels(selectedPanels);
    setPanelPickerOpen(true);
  };
  const toggleDraftPanel = (panel: DashboardPanelId) => {
    setDraftPanels((current) =>
      current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel]
    );
  };
  const savePanelSelection = () => {
    setSelectedPanels(draftPanels);
    saveDashboardPanels(draftPanels);
    setPanelPickerOpen(false);
  };
  const moveDraftPanel = (panel: DashboardPanelId, direction: -1 | 1) => {
    setDraftPanels((current) => {
      const from = current.indexOf(panel);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };
  const restoreDefaultLayout = () => {
    const defaults = [...DASHBOARD_PANELS];
    setDraftPanels(defaults);
    setSelectedPanels(defaults);
    saveDashboardPanels(defaults);
    setPanelPickerOpen(false);
  };
  const moveSavedPanel = (panel: DashboardPanelId, destination: DashboardPanelId) => {
    setSelectedPanels((current) => {
      const fromIndex = current.indexOf(panel);
      const destinationIndex = current.indexOf(destination);
      if (fromIndex < 0 || destinationIndex < 0 || fromIndex === destinationIndex) return current;
      const next = [...current];
      next.splice(fromIndex, 1);
      // A removed item shifts a later destination left by one. Insert before
      // the panel it was dropped onto, matching the visual drop target.
      next.splice(fromIndex < destinationIndex ? destinationIndex - 1 : destinationIndex, 0, panel);
      saveDashboardPanels(next);
      return next;
    });
  };
  const handlePanelDrop = (destination: DashboardPanelId, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const panelFromTransfer = event.dataTransfer.getData("text/plain") as DashboardPanelId;
    const panel = panelFromTransfer || draggedPanel;
    if (panel && selectedPanels.includes(panel)) moveSavedPanel(panel, destination);
    setDraggedPanel(null);
    setDragOverPanel(null);
  };

  const renderPanel = (panel: DashboardPanelId) => {
    switch (panel) {

      case "deadline-reminders":
        return entriesLoading ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-56" />
          </div>
        ) : <DeadlineReminders entries={allEntries} projectNames={projectNames} />;
      case "activity":
        return (
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Minutes logged — last 7 days</p>
            </div>
            <div className="p-4"><ActivityChart data={activityData} /></div>
          </div>
        );
      case "current-projects":
        return (
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Current Projects</h2>
              <button onClick={() => navigate("/projects")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all</button>
            </div>
            <div className="p-4">
              {projectTimeData.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No active projects.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectTimeData.map((project) => (
                    <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="w-full flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 transition text-left group">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition">{project.name}</p>
                        <TagList tags={project.tags} className="mt-1" />
                      </div>
                      <span className="text-xs font-medium text-slate-500 shrink-0">{formatDuration(project.minutes)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case "tags":
        return (
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
              <button onClick={() => navigate("/entries")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Browse entries</button>
            </div>
            <div className="p-4">
              {tagStats.length === 0 ? <p className="text-sm text-slate-400">No tags yet. Add a tag to a project or entry to see it here.</p> : (
                <div className="flex flex-wrap gap-2">
                  {tagStats.map((tag) => (
                    <span key={tag.name} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {tag.name}<span className="px-1.5 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-blue-600">{tag.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case "recent-entries":
        return (
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent Entries</h2>
              <button onClick={() => navigate("/entries")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all</button>
            </div>
            {recentEntries.length === 0 ? <div className="text-center py-12"><p className="text-sm text-slate-400">No entries yet. Start logging work to see activity here.</p></div> : (
              <div className="divide-y divide-slate-100">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="px-4 py-3 hover:bg-slate-50/50 transition">
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-medium text-slate-400 w-16 shrink-0">{relativeDay(entry.entryDate || entry.createdAt)}</span>
                      <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">{entrySummary(entry, fieldsByProject[entry.projectId] || [])}</span>
                      <span className="text-xs font-medium text-slate-600 shrink-0 w-16 text-right">{formatDuration(entry.durationMinutes)}</span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">{projectNames[entry.projectId] || "Unknown"}</span>
                    </div>
                    <TagList tags={entry.tags} className="mt-1.5 ml-[72px]" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  const usesDefaultLayout = selectedPanels.length === DASHBOARD_PANELS.length
    && selectedPanels.every((panel, index) => panel === DASHBOARD_PANELS[index]);
  const customPanelWidth = (index: number) => {
    // Every custom panel gets half a desktop row. If a panel is left without a
    // neighbour after removals, let it use the whole row rather than retaining
    // an empty grid slot from a removed panel.
    const isUnpairedLastPanel = selectedPanels.length % 2 === 1 && index === selectedPanels.length - 1;
    return selectedPanels.length === 1 || isUnpairedLastPanel ? "lg:col-span-6" : "lg:col-span-3";
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── 1. Greeting ─────────────────────────────────────────────────── */}
      <PageHeader
        title={`${getGreeting()}, ${displayName} \u{1F44B}`}
        subtitle="Here's what you've been working on."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setArrangingPanels((current) => !current)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium transition ${arrangingPanels ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50 text-slate-700"}`}
            >
              <GripVertical className="h-4 w-4" /> {arrangingPanels ? "Done arranging" : "Arrange panels"}
            </button>
            <button
              onClick={openPanelPicker}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <LayoutDashboard className="h-4 w-4" /> Customize dashboard
            </button>
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          </div>
        }
      />

      {/* ── 2. Key Statistics ───────────────────────────────────────────── */}

      {/* ── Deadline Reminders ─────────────────────────────────────────── */}

      {truncated && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing your most recent 500 entries. The totals above cover those, not your whole logbook.
        </p>
      )}

      {loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadFailures === 1
            ? "One project's field list couldn't be loaded, so some older entries may show fewer details."
            : `${loadFailures} projects' field lists couldn't be loaded, so some older entries may show fewer details.`}
        </p>
      )}

      {arrangingPanels && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Drag a panel onto another panel to move it. Changes are saved automatically.
        </p>
      )}

      {usesDefaultLayout && !arrangingPanels ? (
        <>
          {renderPanel("deadline-reminders")}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">{renderPanel("activity")}</div>
            <div className="lg:col-span-2">{renderPanel("current-projects")}</div>
          </div>
          {renderPanel("tags")}
          {renderPanel("recent-entries")}
        </>
      ) : selectedPanels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
          {selectedPanels.map((panel, index) => (
            <section
              key={panel}
              draggable={arrangingPanels}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", panel);
                event.dataTransfer.effectAllowed = "move";
                setDraggedPanel(panel);
              }}
              onDragOver={(event) => {
                if (!arrangingPanels || draggedPanel === panel) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverPanel(panel);
              }}
              onDrop={(event) => arrangingPanels && handlePanelDrop(panel, event)}
              onDragEnd={() => {
                setDraggedPanel(null);
                setDragOverPanel(null);
              }}
              className={`${customPanelWidth(index)} ${arrangingPanels ? "relative cursor-grab active:cursor-grabbing" : ""} ${dragOverPanel === panel ? "rounded-lg ring-2 ring-blue-500 ring-offset-2" : ""}`}
              aria-label={DASHBOARD_PANEL_DETAILS[panel].title}
            >
              {arrangingPanels && (
                <span className="absolute right-2 top-2 z-10 rounded bg-white/90 p-1 text-slate-400 shadow-sm" aria-hidden="true">
                  <GripVertical className="h-4 w-4" />
                </span>
              )}
              {renderPanel(panel)}
            </section>
          ))}
        </div>
      )}

      {selectedPanels.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-sm font-semibold text-slate-800">Your dashboard is ready to customise</h2>
          <p className="mt-1 text-sm text-slate-500">Choose statistics or information panels to start building your view.</p>
          <button onClick={openPanelPicker} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">Choose panels</button>
        </div>
      )}

      <Modal open={panelPickerOpen} onClose={() => setPanelPickerOpen(false)} title="Customize dashboard" wide>
        <p className="mb-4 text-sm text-slate-500">Choose the statistics and information you want to monitor, then use the arrows to arrange selected panels. Your layout is saved to this device.</p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Dashboard panels</legend>
          {[...draftPanels, ...DASHBOARD_PANELS.filter((panel) => !draftPanels.includes(panel))].map((panel) => {
            const detail = DASHBOARD_PANEL_DETAILS[panel];
            const panelIndex = draftPanels.indexOf(panel);
            const selected = panelIndex >= 0;
            return (
              <div key={panel} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <label className="flex flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleDraftPanel(panel)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{detail.title}</span>
                    <span className="block text-xs text-slate-500">{detail.description}</span>
                  </span>
                </label>
                {selected && (
                  <div className="flex shrink-0 flex-col" aria-label={`${detail.title} position`}>
                    <button
                      type="button"
                      onClick={() => moveDraftPanel(panel, -1)}
                      disabled={panelIndex === 0}
                      aria-label={`Move ${detail.title} up`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    ><ChevronUp className="h-4 w-4" /></button>
                    <button
                      type="button"
                      onClick={() => moveDraftPanel(panel, 1)}
                      disabled={panelIndex === draftPanels.length - 1}
                      aria-label={`Move ${detail.title} down`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    ><ChevronDown className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={restoreDefaultLayout} className="text-sm font-medium text-blue-600 hover:text-blue-700">Restore defaults</button>
          <div className="flex gap-2">
            <button onClick={() => setPanelPickerOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={savePanelSelection} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Save dashboard</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
