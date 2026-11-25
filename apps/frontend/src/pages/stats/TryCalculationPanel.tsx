import { Bookmark } from "lucide-react";

import { button } from "../../lib/ui";
import { ErrorLine, LoadingLine } from "./Feedback";
import Panel from "./Panel";
import { formatNumber, labelClass, selectClass } from "./format";
import type { ProjectStats } from "./useProjectStats";

/** A field is written {in braces} so names with spaces work as one token. */
const referenceFor = (name: string) => `{${name}}`;

const FUNCTIONS = ["COUNT()", "SUM(field)", "AVG(field)", "MIN(field)", "MAX(field)"];

/**
 * Working something out before naming it (US16): the expression box, the
 * fields it can mention, and — once the server has answered — the number,
 * with the option to keep it as a saved statistic.
 */
export default function TryCalculationPanel({
  stats,
  onSaveAsStatistic,
}: {
  stats: ProjectStats;
  onSaveAsStatistic: (expression: string) => void;
}) {
  return (
    <Panel
      level={3}
      title="Try a calculation"
      description={
        <>
          Work something out over every entry in this project — for example{" "}
          <span className="font-mono text-slate-600">SUM(&#123;Hours&#125;) / COUNT()</span>.
        </>
      }
    >
      {stats.loadingFields ? (
        <p className="text-xs text-slate-500">Loading fields…</p>
      ) : (
        <>
          <form onSubmit={stats.runExpression} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="custom-expression" className={labelClass}>
                Expression
              </label>
              <input
                id="custom-expression"
                value={stats.expression}
                onChange={(e) => stats.setExpression(e.target.value)}
                placeholder="SUM({Hours}) / COUNT()"
                className={`${selectClass} font-mono`}
              />
            </div>
            <button type="submit" disabled={stats.evaluating || !stats.expression.trim()} className={button("primary")}>
              Calculate
            </button>
          </form>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
            <div>
              <p className="mb-1 font-medium text-slate-500">Fields you can use</p>
              {stats.numericFields.length === 0 ? (
                <p className="text-slate-500">
                  This project has no Number or Computed fields yet, so only COUNT() will work.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {stats.numericFields.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => stats.setExpression((current) => `${current}${referenceFor(f.name)}`)}
                      title={`Add ${f.name} to the expression`}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-600 transition-colors duration-150 hover:bg-slate-100"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 font-medium text-slate-500">Functions</p>
              <div className="flex flex-wrap gap-1">
                {FUNCTIONS.map((fn) => (
                  <span key={fn} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-600">
                    {fn}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-slate-500">with + - * / and parentheses</p>
            </div>
          </div>

          <div>
            {stats.evaluating ? (
              <LoadingLine text="Calculating…" />
            ) : stats.expressionError ? (
              <ErrorLine text={stats.expressionError} />
            ) : stats.expressionValue !== null ? (
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(stats.expressionValue)}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{stats.evaluatedExpression}</p>
                </div>
                <button type="button" onClick={() => onSaveAsStatistic(stats.evaluatedExpression)} className={button("secondary", "sm")}>
                  <Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Save as statistic
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}
