import { useMemo } from "react";
import type { Entry, EntryField, GradeModule, Project, Reminder } from "../../api";
import { computeModule } from "../../lib/grades";
import { academicYears, defaultAcademicYear } from "../../lib/gradeDisplay";
import { buildNextUp, buildRadar } from "../../lib/today";
import { entryDateKey, localDateKey } from "../../lib/utils";
import {
  entryStreaks,
  monthlyEntryCounts,
  tagRanking,
  weeklyProgress,
} from "../../lib/dashboardInsights";
import { entrySummary } from "./entryText";

/**
 * Everything the dashboard derives from the data it has loaded.
 *
 * Pure arithmetic, no fetching and no state: given the same projects and
 * entries it always produces the same panel data, which is what makes the
 * panels cheap to reason about and the page easy to read.
 */
export function useDashboardInsights({
  projects, allEntries, fieldsByProject, modules, reminders,
}: {
  projects: Project[];
  allEntries: Entry[];
  fieldsByProject: Record<string, EntryField[]>;
  modules: GradeModule[];
  reminders: Reminder[];
}) {
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

  return {
    activityData, projectTimeData, recentEntries, projectNames, tagStats,
    streaks, monthlyCounts, progress, tagRanks,
    thisYearModules, moduleSummaries, nextUp, radar, todayKey,
  };
}
