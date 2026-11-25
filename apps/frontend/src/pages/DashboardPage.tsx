import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, GripVertical, ArrowRight } from "lucide-react";

import { getGreeting } from "../lib/utils";
import { button } from "../lib/ui";
import { parseStatisticPanel, type DashboardPanelId } from "../lib/dashboardPreferences";
import PageHeader from "../components/PageHeader";
import Skeleton from "../components/Skeleton";
import DailyNote from "../components/dashboard/DailyNote";
import Eyebrow from "../components/dashboard/Eyebrow";
import NextUp from "../components/dashboard/NextUp";
import OnYourRadar from "../components/dashboard/OnYourRadar";
import ModulesAtAGlance from "../components/dashboard/ModulesAtAGlance";
import GettingStarted from "../components/dashboard/GettingStarted";
import { useDashboardData, useToday } from "./dashboard/useDashboardData";
import { useDashboardInsights } from "./dashboard/useDashboardInsights";
import { usePanelLayout } from "./dashboard/usePanelLayout";
import PanelPicker from "./dashboard/PanelPicker";
import {
  ActivityPanel,
  MonthlyEntriesPanel,
  ProgressPanel,
  TagRankingPanel,
  WeekComparisonPanel,
} from "./dashboard/panels/charts";
import {
  CurrentProjectsPanel,
  DeadlineRemindersPanel,
  RecentEntriesPanel,
  TagsPanel,
} from "./dashboard/panels/lists";
import { StatisticPanel, StreakCard } from "./dashboard/panels/tiles";

/**
 * The dashboard: what matters today, then the student's own panels.
 *
 * Data arrives in two stages (projects, then entries) so the page appears
 * as soon as it can; everything the panels show is derived from that data
 * by `useDashboardInsights`, and the layout is owned by `usePanelLayout`.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    projects, allEntries, fieldsByProject,
    loading, entriesLoading, dataLoadFailed, loadFailures, truncated,
  } = useDashboardData();
  const { modules, reminders, todayLoading, modulesFailed, remindersFailed } = useToday();
  const {
    activityData, projectTimeData, recentEntries, projectNames, tagStats,
    streaks, monthlyCounts, progress, tagRanks,
    thisYearModules, moduleSummaries, nextUp, radar,
  } = useDashboardInsights({ projects, allEntries, fieldsByProject, modules, reminders });
  const layout = usePanelLayout({ projects, projectNames });
  const [displayName] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("logbook-name") : null) || "Student"
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

  const renderPanel = (panel: DashboardPanelId) => {
    const saved = parseStatisticPanel(panel);
    if (saved) {
      return (
        <StatisticPanel
          state={layout.statistics[panel]}
          projectName={projectNames[saved.projectId] ?? "Unknown project"}
          onRemove={() => layout.removePanel(panel)}
        />
      );
    }
    switch (panel) {
      case "entry-streak":
        return <StreakCard streaks={streaks} loading={entriesLoading} />;
      case "entry-progress":
        return <ProgressPanel weeks={progress} loading={entriesLoading} />;
      case "monthly-entries":
        return <MonthlyEntriesPanel months={monthlyCounts} loading={entriesLoading} />;
      case "week-comparison":
        return <WeekComparisonPanel entries={allEntries} loading={entriesLoading} />;
      case "tag-ranking":
        return <TagRankingPanel ranks={tagRanks} loading={entriesLoading} />;
      case "deadline-reminders":
        return <DeadlineRemindersPanel entries={allEntries} projectNames={projectNames} loading={entriesLoading} />;
      case "activity":
        return <ActivityPanel data={activityData} />;
      case "current-projects":
        return <CurrentProjectsPanel projects={projectTimeData} />;
      case "tags":
        return <TagsPanel tags={tagStats} />;
      case "recent-entries":
        return (
          <RecentEntriesPanel
            entries={recentEntries}
            projectNames={projectNames}
            fieldsByProject={fieldsByProject}
          />
        );
    }
  };

  // Small figure panels sit in a row of tiles; charts and lists share a
  // two-column grid. Each keeps the student's order within its group.
  const isTile = (panel: DashboardPanelId) => panel === "entry-streak" || parseStatisticPanel(panel) !== null;
  const tilePanels = layout.selectedPanels.filter(isTile);
  const widePanels = layout.selectedPanels.filter((panel) => !isTile(panel));

  const renderPanelSlot = (panel: DashboardPanelId, className: string) => (
    <section
      key={panel}
      draggable={layout.arrangingPanels}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", panel);
        event.dataTransfer.effectAllowed = "move";
        layout.setDraggedPanel(panel);
      }}
      onDragOver={(event) => {
        if (!layout.arrangingPanels || layout.draggedPanel === panel) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        layout.setDragOverPanel(panel);
      }}
      onDrop={(event) => layout.arrangingPanels && layout.handlePanelDrop(panel, event)}
      onDragEnd={() => {
        layout.setDraggedPanel(null);
        layout.setDragOverPanel(null);
      }}
      className={`relative flex min-w-0 flex-col [&>*:last-child]:flex-1 ${className} ${layout.arrangingPanels ? "cursor-grab active:cursor-grabbing" : ""} ${layout.dragOverPanel === panel ? "rounded-lg ring-2 ring-blue-500 ring-offset-2" : ""}`}
      aria-label={layout.panelDetail(panel).title}
    >
      {layout.arrangingPanels && (
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
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-6">
            <div>
              <h2><Eyebrow>Your panels</Eyebrow></h2>
              <p className="mt-0.5 text-xs text-slate-500">The panels you chose to keep an eye on.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={layout.toggleArranging}
                aria-pressed={layout.arrangingPanels}
                className={layout.arrangingPanels ? `${button("ghost", "sm")} bg-blue-50 text-blue-700` : button("ghost", "sm")}
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" /> {layout.arrangingPanels ? "Done arranging" : "Arrange panels"}
              </button>
              <button onClick={layout.openPanelPicker} aria-label="Customize dashboard" className={`${button("ghost", "sm")} text-blue-600 hover:text-blue-700`}>
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

          {layout.layoutSaveFailed && (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your layout is saved on this device, but couldn't be saved to your account. It will show here, but not on your other devices yet.
            </p>
          )}

          {layout.arrangingPanels && (
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

          {layout.selectedPanels.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <h2 className="text-sm font-semibold text-slate-800">Your dashboard is ready to customise</h2>
              <p className="mt-1 text-sm text-slate-500">Choose statistics or information panels to start building your view.</p>
              <button onClick={layout.openPanelPicker} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">Choose panels</button>
            </div>
          )}
        </>
      )}

      <PanelPicker
        open={layout.panelPickerOpen}
        onClose={layout.closePanelPicker}
        draftPanels={layout.draftPanels}
        availableStatistics={layout.availableStatistics}
        panelDetail={layout.panelDetail}
        onToggle={layout.toggleDraftPanel}
        onMove={layout.moveDraftPanel}
        onRestoreDefaults={layout.restoreDefaultLayout}
        onSave={layout.savePanelSelection}
      />
    </div>
  );
}
