import TrendChart from "../../components/TrendChart";
import { ErrorLine, LoadingLine } from "./Feedback";
import Panel from "./Panel";
import { COUNT_MODE, ENTRY_DATE_OPTION, formatNumber, labelClass, periodLabel, selectClass } from "./format";
import type { ProjectStats } from "./useProjectStats";

const BUCKETS = ["day", "week", "month"] as const;

/**
 * Entries per period, counted or summed, bucketed by a DATE field or — for a
 * project without one — by the day each entry was logged. The description
 * says which of those is being plotted, since the chart itself cannot.
 */
export default function OverTimePanel({ stats }: { stats: ProjectStats }) {
  const { timeline } = stats;
  return (
    <Panel
      level={3}
      title="Over time"
      description={
        stats.plottingByEntryDate
          ? stats.plottedFieldName
            ? `Total ${stats.plottedFieldName} across entries, added up per ${stats.bucket} by the day each was logged.`
            : `How many entries were logged, per ${stats.bucket}.`
          : stats.plottedFieldName
            ? `Total ${stats.plottedFieldName} across entries, added up per ${stats.bucket} by each entry's ${stats.dateFieldName}.`
            : `How many entries have a ${stats.dateFieldName} value, counted per ${stats.bucket}.`
      }
    >
      {stats.loadingFields ? (
        <p className="text-xs text-slate-500">Loading fields…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="timeline-date" className={labelClass}>Date</label>
              <select id="timeline-date" value={stats.dateFieldId} onChange={(e) => stats.setDateFieldId(e.target.value)} className={selectClass}>
                {stats.dateFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
                {/* Always offered: an entry is dated by the day it was logged
                    whether or not its project defines a DATE field. */}
                <option value={ENTRY_DATE_OPTION}>Entry date</option>
              </select>
            </div>
            <div>
              <label htmlFor="timeline-plot" className={labelClass}>Plot</label>
              <select id="timeline-plot" value={stats.timelinePlot} onChange={(e) => stats.setTimelinePlot(e.target.value)} className={selectClass}>
                <option value={COUNT_MODE}>Number of entries</option>
                {stats.numericFields.map((f) => (
                  <option key={f.id} value={f.id}>Total {f.name}</option>
                ))}
              </select>
            </div>
            <div role="group" aria-label="Period" className="flex h-10 overflow-hidden rounded-lg border border-slate-200">
              {BUCKETS.map((b) => (
                <button
                  key={b}
                  onClick={() => stats.setBucket(b)}
                  aria-pressed={stats.bucket === b}
                  className={`flex-1 px-3 text-xs font-medium capitalize transition-colors duration-150 ${
                    stats.bucket === b ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            {stats.computingTimeline ? (
              <LoadingLine text="Computing…" />
            ) : stats.timelineError ? (
              <ErrorLine text={stats.timelineError} announce={false} />
            ) : timeline && timeline.points.length > 0 ? (
              <>
                <TrendChart
                  accent
                  data={timeline.points.map((p) => ({ label: periodLabel(p.date, stats.bucket), value: p.value }))}
                  formatValue={stats.plottedFieldName ? formatNumber : (v) => String(Math.round(v))}
                />
                {stats.timelineRange && (
                  <p className="mt-1 text-xs text-slate-500">
                    {stats.timelineRange}, per {stats.bucket}. Periods with nothing logged are skipped.
                  </p>
                )}
              </>
            ) : timeline ? (
              <p className="py-2 text-sm text-slate-500">No dated entries yet.</p>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}
