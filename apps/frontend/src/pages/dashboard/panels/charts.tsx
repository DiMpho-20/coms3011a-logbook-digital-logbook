import Skeleton from "../../../components/Skeleton";
import BarChart from "../../../components/BarChart";
import TrendChart from "../../../components/TrendChart";
import WeekComparison from "../../../components/WeekComparison";
import type { Entry } from "../../../api";
import type { MonthCount, TagRank, WeekProgress } from "../../../lib/dashboardInsights";

/** The seven-day view of time logged, drawn by hand to keep the bundle small. */
export function ActivityChart({ data }: { data: { label: string; value: number }[] }) {
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

export function ActivityPanel({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">Minutes logged — last 7 days</p>
      </div>
      <div className="p-4"><ActivityChart data={data} /></div>
    </div>
  );
}

export function ProgressPanel({ weeks, loading }: { weeks: WeekProgress[]; loading: boolean }) {
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Progress Over Time</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Total entries logged — last 8 weeks</p>
        </div>
        {!loading && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-slate-900 tabular-nums">{thisWeek.total}</p>
            <p className="text-[11px] text-slate-400">
              {thisWeek.entries} this week · {lastWeek.entries} last week
            </p>
          </div>
        )}
      </div>
      <div className="p-4">
        {loading ? <Skeleton className="h-[160px] w-full" /> : thisWeek.total === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No entries yet. Your progress will show here.</p>
        ) : (
          <TrendChart
            data={weeks.map((w) => ({ label: w.label, value: w.total }))}
            formatValue={(v) => `${v} ${v === 1 ? "entry" : "entries"}`}
          />
        )}
      </div>
    </div>
  );
}

export function MonthlyEntriesPanel({ months, loading }: { months: MonthCount[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Entries per Month</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">Last 6 months</p>
      </div>
      <div className="p-4">
        {loading ? <Skeleton className="h-[160px] w-full" /> : (
          <BarChart data={months.map((m) => ({ label: m.label, value: m.count }))} />
        )}
      </div>
    </div>
  );
}

export function TagRankingPanel({ ranks, loading }: { ranks: TagRank[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Tag Ranking</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">Entries using each tag</p>
      </div>
      <div className="p-4">
        {loading ? <Skeleton className="h-[160px] w-full" /> : ranks.length === 0 ? (
          <p className="text-sm text-slate-400">No tagged entries yet. Tag your entries to see which you use most.</p>
        ) : (
          <BarChart
            data={ranks.slice(0, 8).map((t, i) => ({ label: `${i + 1}. ${t.name}`, value: t.entries }))}
            formatValue={(v) => `${v} ${v === 1 ? "entry" : "entries"}`}
          />
        )}
      </div>
    </div>
  );
}

export function WeekComparisonPanel({ entries, loading }: { entries: Entry[]; loading: boolean }) {
  return loading ? (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : <WeekComparison entries={entries} />;
}
