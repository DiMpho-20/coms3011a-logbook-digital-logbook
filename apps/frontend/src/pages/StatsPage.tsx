import { Link } from "react-router-dom";
import { BarChart3, CircleAlert } from "lucide-react";

import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { button } from "../lib/ui";
import BreakdownPanel from "./stats/BreakdownPanel";
import DeleteStatisticModal from "./stats/DeleteStatisticModal";
import OverTimePanel from "./stats/OverTimePanel";
import ProjectSelector from "./stats/ProjectSelector";
import SavedStatisticsPanel from "./stats/SavedStatisticsPanel";
import StatisticDraftModal from "./stats/StatisticDraftModal";
import TimeLoggedPanel from "./stats/TimeLoggedPanel";
import TryCalculationPanel from "./stats/TryCalculationPanel";
import { useProjectStats } from "./stats/useProjectStats";
import { useSavedStatistics } from "./stats/useSavedStatistics";

/**
 * Statistics: what has been logged, and whatever the project's own fields
 * can add up to. The requests live in `useProjectStats` and the saved
 * calculations in `useSavedStatistics`; the panels under `./stats` draw them.
 */
export default function StatsPage() {
  const stats = useProjectStats();
  const saved = useSavedStatistics(stats.selectedProjectId);

  const header = (
    <PageHeader title="Statistics" subtitle="How you're working, and whatever your own fields can add up." />
  );

  if (stats.loadingProjects) {
    return (
      <div className="space-y-6 max-w-5xl" aria-busy="true">
        <span className="sr-only" role="status">Loading projects…</span>
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      </div>
    );
  }

  if (stats.projectsFailed) {
    return (
      <div className="space-y-6 max-w-5xl">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={CircleAlert}
            title="Your projects couldn't be loaded"
            description="Statistics are worked out per project, so there's nothing to show yet. Check your connection and try again."
            action={<button onClick={stats.loadProjects} className={button("secondary")}>Try again</button>}
          />
        </div>
      </div>
    );
  }

  if (stats.projects.length === 0) {
    return (
      <div className="space-y-6 max-w-5xl">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={BarChart3}
            title="Nothing to measure yet"
            description="No projects yet. Create one to see stats."
            action={<Link to="/projects" className={button("primary")}>Go to Projects</Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {header}

      {/* ── 1. Time logged: the headline, no setup ─────────────────────── */}
      <TimeLoggedPanel times={stats.projectTimes} failed={stats.projectTimesFailed} />

      {/* ── 2. Project statistics: the selector, then what it controls ─── */}
      <section aria-labelledby="project-statistics-heading" className="space-y-4">
        <ProjectSelector
          projects={stats.projects}
          selectedProjectId={stats.selectedProjectId}
          onSelect={stats.selectProject}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          <BreakdownPanel stats={stats} />
          <OverTimePanel stats={stats} />
        </div>

        <SavedStatisticsPanel saved={saved} />
        <TryCalculationPanel stats={stats} onSaveAsStatistic={saved.openNewStatistic} />
      </section>

      <StatisticDraftModal saved={saved} />
      <DeleteStatisticModal saved={saved} />
    </div>
  );
}
