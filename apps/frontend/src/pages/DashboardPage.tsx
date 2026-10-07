import { useState, useEffect, useMemo, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sigma,
  Flame,
  ArrowRight,
} from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchAllEntries,
  fetchProjectStatistic,
  fetchProjectStatistics,
  fetchGradeModules,
  fetchReminders,
  type CustomStatistic,
  type GradeModule,
  type Reminder,
  type Project,
  type Entry,
  type EntryField,
} from "../api";
import { fieldValueText, formatDuration, getGreeting, localDateKey, entryDateKey } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import DailyNote from "../components/dashboard/DailyNote";
import Eyebrow from "../components/dashboard/Eyebrow";
import NextUp from "../components/dashboard/NextUp";
import OnYourRadar from "../components/dashboard/OnYourRadar";
import ModulesAtAGlance from "../components/dashboard/ModulesAtAGlance";
import GettingStarted from "../components/dashboard/GettingStarted";
import { computeModule } from "../lib/grades";
import { academicYears, defaultAcademicYear } from "../lib/gradeDisplay";
import { buildNextUp, buildRadar } from "../lib/today";
import { button } from "../lib/ui";
import DeadlineReminders from "../components/DeadlineReminders";
import Skeleton from "../components/Skeleton";
import TagList from "../components/TagList";
import Modal from "../components/Modal";
import BarChart from "../components/BarChart";
import TrendChart from "../components/TrendChart";
import WeekComparison from "../components/WeekComparison";
import {
  entryStreaks,
  monthlyEntryCounts,
  tagRanking,
  weeklyProgress,
  type EntryStreaks,
} from "../lib/dashboardInsights";
import {
  DASHBOARD_PANELS,
  DEFAULT_DASHBOARD_PANELS,
  isBuiltInPanel,
  loadDashboardPanels,
  parseStatisticPanel,
  persistDashboardPanels,
  resetDashboardPanels,
  statisticPanelId,
  syncDashboardPanels,
  type BuiltInPanelId,
  type DashboardPanelId,
} from "../lib/dashboardPreferences";

const DASHBOARD_PANEL_DETAILS: Record<BuiltInPanelId, { title: string; description: string }> = {
  "entry-streak": { title: "Entry streak", description: "How many days in a row you've logged an entry" },
  "deadline-reminders": { title: "Deadline reminders", description: "Upcoming due dates from your entries" },
  activity: { title: "Activity", description: "A seven-day view of time logged" },
  "current-projects": { title: "Current projects", description: "Your active projects and their logged time" },
  "entry-progress": { title: "Progress over time", description: "Your running total of entries, week by week" },
  "monthly-entries": { title: "Entries per month", description: "How many entries you logged in each of the last six months" },
  "week-comparison": { title: "Compare weeks", description: "Put any two of the last twelve weeks side by side" },
  tags: { title: "Tags", description: "Tags used in your projects and entries" },
  "tag-ranking": { title: "Tag ranking", description: "Your most-used tags and how many entries use each" },
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

// ── Saved statistic panel (US18) ─────────────────────────────────────────

/** What a statistic panel shows: the statistic, or why it can't be shown. */
type StatisticState =
  | { status: "loading" }
  | { status: "ready"; statistic: CustomStatistic }
  | { status: "missing" }
  | { status: "failed" };

function formatStatisticValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function StatisticPanel({
  state,
  projectName,
  onRemove,
}: {
  state: StatisticState | undefined;
  projectName: string;
  onRemove: () => void;
}) {
  const statistic = state?.status === "ready" ? state.statistic : null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-start gap-3 h-full">
      <div className="p-2 rounded-lg bg-violet-50 text-violet-600">
        <Sigma className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {!state || state.status === "loading" ? (
          <>
            <Skeleton className="h-5 w-14" />
            <Skeleton className="mt-1 h-3 w-28" />
          </>
        ) : statistic ? (
          <>
            <p className="text-lg font-bold text-slate-900">
              {statistic.value === null ? "—" : formatStatisticValue(statistic.value)}
            </p>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              {statistic.name} · {projectName}
            </p>
            {statistic.error && <p className="mt-1 text-[11px] text-amber-700">{statistic.error}</p>}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">
              {state.status === "missing" ? "This statistic was deleted" : "Couldn't load this statistic"}
            </p>
            {state.status === "missing" && (
              <button onClick={onRemove} className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                Remove panel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Entry streak panel ───────────────────────────────────────────────────

function dayCount(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function StreakCard({ streaks, loading }: { streaks: EntryStreaks; loading: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3 h-full">
      <div className={`p-2 rounded-lg ${streaks.current > 0 ? "bg-orange-50 text-orange-500" : "bg-slate-100 text-slate-400"}`}>
        <Flame className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-900">
          {loading ? <Skeleton className="h-5 w-14 align-middle" /> : dayCount(streaks.current)}
        </p>
        <p className="text-[11px] font-medium text-slate-500">Entry Streak</p>
        {!loading && (
          <p className="text-[11px] text-slate-400 truncate">
            {streaks.current > 0 && !streaks.loggedToday
              ? "Log an entry today to keep it going"
              : `Longest: ${dayCount(streaks.longest)}`}
          </p>
        )}
      </div>
    </div>
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
      if (field.type === "BOOLEAN") return val ? "Yes" : "No";
      // Checklists and references are objects; show their labels.
      const text = fieldValueText(val);
      if (text) return text;
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
  // Set when projects or entries couldn't be loaded, so an empty list is not taken for a new account.
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [loadFailures, setLoadFailures] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [selectedPanels, setSelectedPanels] = useState<DashboardPanelId[]>(loadDashboardPanels);
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [draftPanels, setDraftPanels] = useState<DashboardPanelId[]>(selectedPanels);
  const [arrangingPanels, setArrangingPanels] = useState(false);
  const [draggedPanel, setDraggedPanel] = useState<DashboardPanelId | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<DashboardPanelId | null>(null);
  // Saved statistics on the dashboard, by panel id.
  const [statistics, setStatistics] = useState<Record<string, StatisticState>>({});
  // Every saved statistic the picker can offer; null until the picker loads them.
  const [availableStatistics, setAvailableStatistics] = useState<CustomStatistic[] | null>(null);
  const [layoutSaveFailed, setLayoutSaveFailed] = useState(false);
  const [displayName] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("logbook-name") : null) || "Student"
  );
  // "Today": the student's modules and their own reminders. Two requests,
  // made alongside the entries; the module list is cached for offline use.
  const [modules, setModules] = useState<GradeModule[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [modulesFailed, setModulesFailed] = useState(false);
  const [remindersFailed, setRemindersFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchGradeModules(), fetchReminders("pending")]).then(([moduleResult, reminderResult]) => {
      if (cancelled) return;
      if (moduleResult.status === "fulfilled") setModules(moduleResult.value);
      else setModulesFailed(true);
      if (reminderResult.status === "fulfilled") setReminders(reminderResult.value);
      else setRemindersFailed(true);
      setTodayLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled) setDataLoadFailed(true);
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

  // The page opens with this device's copy of the layout; the one saved on
  // the server (from any device) replaces it once it arrives.
  useEffect(() => {
    let cancelled = false;
    syncDashboardPanels().then((panels) => {
      if (!cancelled && panels) setSelectedPanels(panels);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the current value of each saved statistic on the dashboard.
  useEffect(() => {
    const unloaded = selectedPanels.filter((panel) => parseStatisticPanel(panel) && !(panel in statistics));
    if (unloaded.length === 0) return;
    setStatistics((current) => ({
      ...current,
      ...Object.fromEntries(unloaded.map((panel) => [panel, { status: "loading" } as StatisticState])),
    }));
    unloaded.forEach((panel) => {
      const { projectId, statisticId } = parseStatisticPanel(panel)!;
      fetchProjectStatistic(projectId, statisticId)
        .then((statistic): StatisticState => ({ status: "ready", statistic }))
        .catch((error): StatisticState =>
          error?.response?.status === 404 ? { status: "missing" } : { status: "failed" }
        )
        .then((state) => setStatistics((current) => ({ ...current, [panel]: state })));
    });
  }, [selectedPanels, statistics]);

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

  // Insight panels: streak, monthly counts, progress, tag ranking.
  const streaks = useMemo(() => entryStreaks(allEntries), [allEntries]);
  const monthlyCounts = useMemo(() => monthlyEntryCounts(allEntries), [allEntries]);
  const progress = useMemo(() => weeklyProgress(allEntries), [allEntries]);
  const tagRanks = useMemo(() => tagRanking(allEntries), [allEntries]);

  // This academic year's modules, each through the grade engine once.
  const thisYearModules = useMemo(() => {
    const year = defaultAcademicYear(academicYears(modules), new Date().getFullYear());
    return modules.filter((m) => year === "ALL" || m.academicYear === year);
  }, [modules]);
  const moduleSummaries = useMemo(
    () => new Map(thisYearModules.map((m) => [m.id, computeModule(m, { target: m.targetMark })])),
    [thisYearModules]
  );
  const todayKey = localDateKey(new Date());
  const nextUp = useMemo(
    () =>
      buildNextUp({
        modules,
        entries: allEntries,
        reminders,
        projectNames: Object.fromEntries(projects.map((p) => [p.id, p.name])),
        describeEntry: (entry) => entrySummary(entry, fieldsByProject[entry.projectId] || []),
        today: todayKey,
      }),
    [modules, allEntries, reminders, projects, fieldsByProject, todayKey]
  );
  const radar = useMemo(
    () =>
      buildRadar({
        modules: thisYearModules,
        summaries: moduleSummaries,
        entries: allEntries,
        dueReminders: reminders.filter((r) => Date.parse(r.remindAt) <= Date.now()).length,
        today: todayKey,
      }),
    [thisYearModules, moduleSummaries, allEntries, reminders, todayKey]
  );
  const todayDataLoading = entriesLoading || todayLoading;

  if (loading) {
    // The shape of the page, not a spinner: greeting, note, then Next up and the radar.
    return (
      <div className="space-y-6 max-w-6xl" aria-busy="true" aria-label="Loading dashboard">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[3, 2].map((rows, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              {Array.from({ length: rows }, (_, j) => <Skeleton key={j} className="h-5 w-full" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const persist = (panels: DashboardPanelId[]) => {
    persistDashboardPanels(panels).then((saved) => setLayoutSaveFailed(!saved));
  };
  const openPanelPicker = () => {
    setDraftPanels(selectedPanels);
    setPanelPickerOpen(true);
    if (availableStatistics === null) {
      // Statistics are saved per project, so ask each active project.
      Promise.allSettled(
        projects.filter((p) => p.status === "ACTIVE").map((p) => fetchProjectStatistics(p.id))
      ).then((results) => {
        const found = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
        setAvailableStatistics(found);
        setStatistics((current) => ({
          ...current,
          ...Object.fromEntries(
            found.map((statistic) => [
              statisticPanelId(statistic.projectId, statistic.id),
              { status: "ready", statistic } as StatisticState,
            ])
          ),
        }));
      });
    }
  };
  const panelDetail = (panel: DashboardPanelId): { title: string; description: string } => {
    if (isBuiltInPanel(panel)) return DASHBOARD_PANEL_DETAILS[panel];
    const state = statistics[panel];
    const projectName = projectNames[parseStatisticPanel(panel)?.projectId ?? ""] ?? "a project";
    return {
      title: state?.status === "ready" ? state.statistic.name : "Saved statistic",
      description: `Your saved statistic in ${projectName}`,
    };
  };
  const removePanel = (panel: DashboardPanelId) => {
    const next = selectedPanels.filter((item) => item !== panel);
    setSelectedPanels(next);
    persist(next);
  };
  const toggleDraftPanel = (panel: DashboardPanelId) => {
    setDraftPanels((current) =>
      current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel]
    );
  };
  const savePanelSelection = () => {
    setSelectedPanels(draftPanels);
    persist(draftPanels);
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
    const defaults = [...DEFAULT_DASHBOARD_PANELS];
    setDraftPanels(defaults);
    setSelectedPanels(defaults);
    resetDashboardPanels();
    setLayoutSaveFailed(false);
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
      persist(next);
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
    const saved = parseStatisticPanel(panel);
    if (saved) {
      return (
        <StatisticPanel
          state={statistics[panel]}
          projectName={projectNames[saved.projectId] ?? "Unknown project"}
          onRemove={() => removePanel(panel)}
        />
      );
    }
    switch (panel) {
      case "entry-streak":
        return <StreakCard streaks={streaks} loading={entriesLoading} />;
      case "entry-progress": {
        const thisWeek = progress[progress.length - 1];
        const lastWeek = progress[progress.length - 2];
        return (
          <div className="bg-white rounded-lg border border-slate-200 h-full">
            <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Progress Over Time</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Total entries logged — last 8 weeks</p>
              </div>
              {!entriesLoading && (
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900 tabular-nums">{thisWeek.total}</p>
                  <p className="text-[11px] text-slate-400">
                    {thisWeek.entries} this week · {lastWeek.entries} last week
                  </p>
                </div>
              )}
            </div>
            <div className="p-4">
              {entriesLoading ? <Skeleton className="h-[160px] w-full" /> : thisWeek.total === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No entries yet. Your progress will show here.</p>
              ) : (
                <TrendChart
                  data={progress.map((w) => ({ label: w.label, value: w.total }))}
                  formatValue={(v) => `${v} ${v === 1 ? "entry" : "entries"}`}
                />
              )}
            </div>
          </div>
        );
      }
      case "monthly-entries":
        return (
          <div className="bg-white rounded-lg border border-slate-200 h-full">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Entries per Month</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Last 6 months</p>
            </div>
            <div className="p-4">
              {entriesLoading ? <Skeleton className="h-[160px] w-full" /> : (
                <BarChart data={monthlyCounts.map((m) => ({ label: m.label, value: m.count }))} />
              )}
            </div>
          </div>
        );
      case "week-comparison":
        return entriesLoading ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : <WeekComparison entries={allEntries} />;
      case "tag-ranking":
        return (
          <div className="bg-white rounded-lg border border-slate-200 h-full">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Tag Ranking</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Entries using each tag</p>
            </div>
            <div className="p-4">
              {entriesLoading ? <Skeleton className="h-[160px] w-full" /> : tagRanks.length === 0 ? (
                <p className="text-sm text-slate-400">No tagged entries yet. Tag your entries to see which you use most.</p>
              ) : (
                <BarChart
                  data={tagRanks.slice(0, 8).map((t, i) => ({ label: `${i + 1}. ${t.name}`, value: t.entries }))}
                  formatValue={(v) => `${v} ${v === 1 ? "entry" : "entries"}`}
                />
              )}
            </div>
          </div>
        );
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

  // Small figure panels sit in a row of tiles; charts and lists share a
  // two-column grid. Each keeps the student's order within its group.
  const isTile = (panel: DashboardPanelId) => panel === "entry-streak" || parseStatisticPanel(panel) !== null;
  const tilePanels = selectedPanels.filter(isTile);
  const widePanels = selectedPanels.filter((panel) => !isTile(panel));

  const renderPanelSlot = (panel: DashboardPanelId, className: string) => (
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
      className={`relative flex min-w-0 flex-col [&>*:last-child]:flex-1 ${className} ${arrangingPanels ? "cursor-grab active:cursor-grabbing" : ""} ${dragOverPanel === panel ? "rounded-lg ring-2 ring-blue-500 ring-offset-2" : ""}`}
      aria-label={panelDetail(panel).title}
    >
      {arrangingPanels && (
        <span className="absolute right-2 top-2 z-10 rounded bg-white/90 p-1 text-slate-400 shadow-sm" aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      {renderPanel(panel)}
    </section>
  );

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  // First use: decided once the entries have arrived, from data already on
  // the page. No entries in any active project means there is nothing yet for
  // the panels and most cards to show, so the page explains how to begin
  // instead. Having a project is not the same as having started: that case
  // gets the shorter "log your first entry" version.
  const firstUse = !entriesLoading && !dataLoadFailed && allEntries.length === 0 && !truncated;
  const activeProject = projects.find((p) => p.status === "ACTIVE");
  const hasModules = modules.length > 0;
  // While onboarding, a card shows only if it has something real in it.
  const showNextUp = !firstUse || todayDataLoading || nextUp.length > 0;
  const showRadar = !firstUse || todayDataLoading || radar.length > 0;
  const showModules = !firstUse || todayLoading || modulesFailed || thisYearModules.length > 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── 1–2. Greeting and the main actions ────────────────────────── */}
      <PageHeader
        title={`${getGreeting()}, ${displayName}.`}
        subtitle={
          <>
            <span className="block text-slate-600">{firstUse ? "Here's how you get started." : "Here's what matters today."}</span>
            <span className="block text-xs text-slate-400">{todayLabel}</span>
          </>
        }
        action={
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
            <button onClick={() => navigate("/projects")} className={button("secondary")}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New project
            </button>
          </div>
        }
      />

      {/* ── First use: how to begin, in place of a page of empty cards ── */}
      {firstUse && (
        <GettingStarted
          hasProjects={projects.length > 0}
          hasModules={hasModules}
          logEntryHref={activeProject ? `/projects/${activeProject.id}?new=1` : "/projects"}
        />
      )}

      {/* ── 3. Daily note ──────────────────────────────────────────────── */}
      <DailyNote />

      {/* ── 4. What's soon, and what needs a nudge ─────────────────────── */}
      {(showNextUp || showRadar) && (
        <div className={`grid grid-cols-1 gap-6 ${showNextUp && showRadar ? "lg:grid-cols-2" : ""}`}>
          {showNextUp && <NextUp items={nextUp} loading={todayDataLoading} remindersFailed={remindersFailed} />}
          {showRadar && <OnYourRadar items={radar} loading={todayDataLoading} />}
        </div>
      )}

      {/* ── 5. Academic snapshot ───────────────────────────────────────── */}
      {showModules && (
        <ModulesAtAGlance
          modules={thisYearModules.slice(0, 6)}
          summaries={moduleSummaries}
          loading={todayLoading}
          failed={modulesFailed}
        />
      )}

      {/* ── 6. Your panels — once there are entries for them to show ───── */}
      {!firstUse && (
        <>
      {/* ── 6. Your panels: the student's own arrangement ─────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-6">
        <div>
          <h2><Eyebrow>Your panels</Eyebrow></h2>
          <p className="mt-0.5 text-xs text-slate-500">The panels you chose to keep an eye on.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setArrangingPanels((current) => !current)}
            aria-pressed={arrangingPanels}
            className={arrangingPanels ? `${button("ghost", "sm")} bg-blue-50 text-blue-700` : button("ghost", "sm")}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" /> {arrangingPanels ? "Done arranging" : "Arrange panels"}
          </button>
          <button onClick={openPanelPicker} aria-label="Customize dashboard" className={`${button("ghost", "sm")} text-blue-600 hover:text-blue-700`}>
            Customize <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {truncated && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing your most recent 500 entries. The panels below cover those, not your whole logbook.
        </p>
      )}

      {loadFailures > 0 && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadFailures === 1
            ? "One project's field list couldn't be loaded, so some older entries may show fewer details."
            : `${loadFailures} projects' field lists couldn't be loaded, so some older entries may show fewer details.`}
        </p>
      )}

      {layoutSaveFailed && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Your layout is saved on this device, but couldn't be saved to your account. It will show here, but not on your other devices yet.
        </p>
      )}

      {arrangingPanels && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Drag a panel onto another panel to move it. Changes are saved automatically.
        </p>
      )}

      {tilePanels.length > 0 && (
        // Flex rather than a fixed grid, so a tile left on its own row widens instead of leaving a gap.
        <div className="flex flex-wrap gap-4">
          {tilePanels.map((panel) => renderPanelSlot(panel, "flex-1 basis-[160px]"))}
        </div>
      )}

      {widePanels.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {widePanels.map((panel, index) =>
            // An odd one out at the end takes the whole row rather than leaving half of it empty.
            renderPanelSlot(panel, widePanels.length % 2 === 1 && index === widePanels.length - 1 ? "lg:col-span-2" : "")
          )}
        </div>
      )}

      {selectedPanels.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-sm font-semibold text-slate-800">Your dashboard is ready to customise</h2>
          <p className="mt-1 text-sm text-slate-500">Choose statistics or information panels to start building your view.</p>
          <button onClick={openPanelPicker} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">Choose panels</button>
        </div>
      )}

        </>
      )}

      <Modal open={panelPickerOpen} onClose={() => setPanelPickerOpen(false)} title="Customize dashboard" wide>
        <p className="mb-4 text-sm text-slate-500">Choose the statistics and information you want to monitor, then use the arrows to arrange selected panels. Your layout is saved to your account, so it's the same on every device.</p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Dashboard panels</legend>
          {[
            ...draftPanels,
            ...DASHBOARD_PANELS.filter((panel) => !draftPanels.includes(panel)),
            ...(availableStatistics ?? [])
              .map((statistic) => statisticPanelId(statistic.projectId, statistic.id))
              .filter((panel) => !draftPanels.includes(panel)),
          ].map((panel) => {
            const detail = panelDetail(panel);
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
        <p className="mt-3 text-xs text-slate-500">
          {availableStatistics === null
            ? "Loading your saved statistics…"
            : availableStatistics.length === 0
              ? "Statistics you save on the Stats page can be added here too."
              : "Your saved statistics from the Stats page are listed with the other panels."}
        </p>
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
