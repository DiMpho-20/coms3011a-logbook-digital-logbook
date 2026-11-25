import { ErrorLine, LoadingLine } from "./Feedback";
import MeterList from "./MeterList";
import Panel from "./Panel";
import { formatNumber, labelClass, OPERATION_LABELS, selectClass, type Operation } from "./format";
import type { ProjectStats } from "./useProjectStats";

/**
 * One field, added up in total or split by another field. Which operations
 * are offered follows the field's type: a number can be summed, averaged,
 * bounded; anything else can only be counted.
 */
export default function BreakdownPanel({ stats }: { stats: ProjectStats }) {
  const { result } = stats;
  return (
    <Panel level={3} title="Breakdown" description="What a field adds up to, in total or split by another field.">
      {stats.loadingFields ? (
        <p className="text-xs text-slate-500">Loading fields…</p>
      ) : stats.fields.length === 0 ? (
        <p className="text-sm text-slate-500">
          This project has no entry fields yet — add one to see it here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="breakdown-measure" className={labelClass}>Measure</label>
              <select id="breakdown-measure" value={stats.metricFieldId} onChange={(e) => stats.setMetricFieldId(e.target.value)} className={selectClass}>
                {stats.fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="breakdown-operation" className={labelClass}>Calculate</label>
              <select
                id="breakdown-operation"
                value={stats.operation}
                onChange={(e) => stats.setOperation(e.target.value as Operation)}
                aria-describedby={!stats.isNumericMetric ? "breakdown-operation-hint" : undefined}
                className={selectClass}
              >
                {stats.availableOperations.map((op) => (
                  <option key={op} value={op}>{OPERATION_LABELS[op]}</option>
                ))}
              </select>
              {!stats.isNumericMetric && (
                <p id="breakdown-operation-hint" className="mt-1 text-[11px] text-slate-500">Only count works on a non-number field.</p>
              )}
            </div>
            <div>
              <label htmlFor="breakdown-group" className={labelClass}>Group by</label>
              <select id="breakdown-group" value={stats.groupByFieldId} onChange={(e) => stats.setGroupByFieldId(e.target.value)} className={selectClass}>
                <option value="">Nothing — one total</option>
                {stats.anyFields.filter((f) => f.id !== stats.metricFieldId).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            {stats.computing ? (
              <LoadingLine text="Computing…" />
            ) : stats.error ? (
              <ErrorLine text={stats.error} announce={false} />
            ) : result && result.groups.length === 1 && result.groups[0].key === "total" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(result.groups[0].value)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {OPERATION_LABELS[stats.operation]} of {stats.selectedMetricField?.name}
                </p>
              </div>
            ) : result && result.groups.length > 0 ? (
              <MeterList data={result.groups.map((g) => ({ label: g.key, value: g.value }))} formatValue={formatNumber} />
            ) : result ? (
              <p className="py-2 text-sm text-slate-500">No entries have this field filled in yet.</p>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}
