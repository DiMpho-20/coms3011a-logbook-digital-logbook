import { Flame, Sigma } from "lucide-react";
import Skeleton from "../../../components/Skeleton";
import type { EntryStreaks } from "../../../lib/dashboardInsights";
import { formatStatisticValue, type StatisticState } from "../statisticState";

/** How many days in a row, and whether today is already counted. */
export function StreakCard({ streaks, loading }: { streaks: EntryStreaks; loading: boolean }) {
  const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
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

/** A saved statistic from the Stats page, or why it can't be shown. */
export function StatisticPanel({
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
