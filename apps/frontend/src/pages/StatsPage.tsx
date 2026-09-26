import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, TrendingUp, Loader2, Clock, Sigma } from "lucide-react";
import { api } from "../api/client";
import {
  fetchProjects,
  fetchEntryFields,
  fetchProjectTimeSummary,
  type Project,
  type EntryField,
} from "../api";
import { formatDuration } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import BarChart from "../components/BarChart";
import TrendChart from "../components/TrendChart";

type GroupResult = { groups: { key: string; value: number }[] };
type TimelineResult = { points: { date: string; value: number }[] };
type Bucket = "day" | "week" | "month";

const OPERATIONS = ["sum", "avg", "count", "min", "max"] as const;
type Operation = typeof OPERATIONS[number];

const COUNT_MODE = "__count__";

function formatNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

export default function StatsPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);

  // Cross-project time overview — the page's headline, needs no setup.
  const [projectTimes, setProjectTimes] = useState<{ label: string; value: number }[] | null>(null);

  // Total / Group
  const [metricFieldId, setMetricFieldId] = useState<string>("");
  const [operation, setOperation] = useState<Operation>("sum");
  const [groupByFieldId, setGroupByFieldId] = useState<string>("");
  const [result, setResult] = useState<GroupResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Over Time
  const [dateFieldId, setDateFieldId] = useState<string>("");
  const [timelinePlot, setTimelinePlot] = useState<string>(COUNT_MODE); // COUNT_MODE or a field id
  const [bucket, setBucket] = useState<Bucket>("week");
  const [timeline, setTimeline] = useState<TimelineResult | null>(null);
  const [computingTimeline, setComputingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Custom Expression (US16)
  const [expression, setExpression] = useState("");
  const [expressionValue, setExpressionValue] = useState<number | null>(null);
  // The expression the shown number actually came from. Captioning the result
  // with whatever is currently typed would let an edited box describe a
  // number it did not produce.
  const [evaluatedExpression, setEvaluatedExpression] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [expressionError, setExpressionError] = useState<string | null>(null);

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data);
        if (!params.get("project") && data.length > 0) {
          setParams({ project: data[0].id });
        }
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Time logged per active project — independent of which one is "selected".
  useEffect(() => {
    const active = projects.filter((p) => p.status === "ACTIVE");
    if (active.length === 0) {
      setProjectTimes(active.length === 0 && projects.length > 0 ? [] : null);
      return;
    }
    let cancelled = false;
    Promise.all(
      active.map(async (p) => {
        try {
          const summary = await fetchProjectTimeSummary(p.id);
          return { label: p.name, value: summary.totalMinutes };
        } catch {
          return { label: p.name, value: 0 };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setProjectTimes(rows.sort((a, b) => b.value - a.value));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingFields(true);
    fetchEntryFields(selectedProjectId)
      .then((data) => {
        setFields(data);
        setMetricFieldId("");
        setGroupByFieldId("");
        setResult(null);
        setDateFieldId("");
        setTimelinePlot(COUNT_MODE);
        setTimeline(null);
        setExpressionValue(null);
        setEvaluatedExpression("");
        setExpressionError(null);
      })
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false));
  }, [selectedProjectId]);

  const numericFields = useMemo(
    () => fields.filter((f) => f.type === "NUMBER" || f.type === "COMPUTED"),
    [fields]
  );
  const dateFields = useMemo(() => fields.filter((f) => f.type === "DATE"), [fields]);
  const anyFields = useMemo(() => fields.filter((f) => f.type !== "COMPUTED"), [fields]);

  // count works for a field of any type ("how many entries have this filled
  // in" is meaningful for a CHECKLIST or a LINK, not just a NUMBER); sum,
  // avg, min and max only make sense for something numeric.
  const selectedMetricField = fields.find((f) => f.id === metricFieldId);
  const isNumericMetric = selectedMetricField?.type === "NUMBER" || selectedMetricField?.type === "COMPUTED";
  const availableOperations = isNumericMetric ? OPERATIONS : (["count"] as const);

  // Show something the moment fields load, rather than an empty control panel.
  useEffect(() => {
    if (fields.length > 0 && !metricFieldId) {
      setMetricFieldId(fields[0].id);
    }
  }, [fields, metricFieldId]);

  // Switching (or defaulting) onto a non-numeric field can't keep a
  // sum/avg/min/max operation selected — fall back to count.
  useEffect(() => {
    if (metricFieldId && !isNumericMetric && operation !== "count") {
      setOperation("count");
    }
  }, [metricFieldId, isNumericMetric, operation]);

  useEffect(() => {
    if (dateFields.length > 0 && !dateFieldId) {
      setDateFieldId(dateFields[0].id);
    }
  }, [dateFields, dateFieldId]);

  const runGroup = async () => {
    if (!selectedProjectId || !metricFieldId || !operation) return;
    // Guards the moment right after switching to a non-numeric field, before
    // the effect above has corrected `operation` back to count.
    if (operation !== "count" && !isNumericMetric) return;
    setComputing(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { metricFieldId, operation };
      if (groupByFieldId) body.groupByFieldId = groupByFieldId;
      const res = await api.post(`/projects/${selectedProjectId}/stats/group`, body);
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to compute stats");
    } finally {
      setComputing(false);
    }
  };

  useEffect(() => {
    if (metricFieldId) void runGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricFieldId, operation, groupByFieldId]);

  const runTimeline = async (targetDateFieldId: string, targetBucket: Bucket, targetPlot: string) => {
    if (!selectedProjectId || !targetDateFieldId) return;
    setComputingTimeline(true);
    setTimelineError(null);
    setTimeline(null);
    try {
      const body: Record<string, unknown> = { dateFieldId: targetDateFieldId, bucket: targetBucket };
      if (targetPlot !== COUNT_MODE) {
        body.operation = "sum";
        body.metricFieldId = targetPlot;
      }
      const res = await api.post(`/projects/${selectedProjectId}/stats/timeline`, body);
      setTimeline(res.data);
    } catch (err: any) {
      setTimelineError(err?.response?.data?.error ?? "Failed to compute timeline");
    } finally {
      setComputingTimeline(false);
    }
  };

  useEffect(() => {
    if (dateFieldId) void runTimeline(dateFieldId, bucket, timelinePlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFieldId, bucket, timelinePlot]);

  /** A field is written {in braces} so names with spaces work as one token. */
  const referenceFor = (name: string) => `{${name}}`;

  const runExpression = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProjectId || !expression.trim()) return;
    setEvaluating(true);
    setExpressionError(null);
    setExpressionValue(null);
    try {
      const asked = expression.trim();
      const res = await api.post(`/projects/${selectedProjectId}/stats/expression`, {
        expression: asked,
      });
      setExpressionValue(res.data.value);
      setEvaluatedExpression(asked);
    } catch (err: any) {
      // The server explains what is wrong with an expression; only fall back
      // when it could not be reached at all.
      setExpressionError(err?.response?.data?.error ?? "Could not work that expression out");
    } finally {
      setEvaluating(false);
    }
  };

  const plottedFieldName =
    timelinePlot !== COUNT_MODE ? fields.find((f) => f.id === timelinePlot)?.name : null;
  const dateFieldName = fields.find((f) => f.id === dateFieldId)?.name ?? "date";

  if (loadingProjects) {
    return <p className="text-sm text-slate-500">Loading projects…</p>;
  }

  if (projects.length === 0) {
    return <p className="text-sm text-slate-500">No projects yet. Create one to see stats.</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Statistics"
        subtitle="Time per project, and whatever your own fields can total, group, or plot."
      />

      {/* Time per project — the headline, no setup required */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-900">Time per project</h2>
        </div>
        {projectTimes === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : projectTimes.every((p) => p.value === 0) ? (
          <p className="text-xs text-slate-500">No time logged yet — entries you add will show up here.</p>
        ) : (
          <BarChart
            data={projectTimes.filter((p) => p.value > 0)}
            formatValue={formatDuration}
          />
        )}
      </section>

      <div>
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Project</label>
        <select
          value={selectedProjectId}
          onChange={(e) => setParams({ project: e.target.value })}
          className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Total / Group */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-900">Total &amp; Group</h2>
        </div>

        {loadingFields ? (
          <p className="text-xs text-slate-500">Loading fields…</p>
        ) : fields.length === 0 ? (
          <p className="text-xs text-slate-500">
            This project has no entry fields yet — add one to see it here.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Field</label>
                <select
                  value={metricFieldId}
                  onChange={(e) => setMetricFieldId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Operation</label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as Operation)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  {availableOperations.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                {!isNumericMetric && (
                  <p className="text-[10px] text-slate-400 mt-1">Only count works on a non-number field.</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Group by (optional)</label>
                <select
                  value={groupByFieldId}
                  onChange={(e) => setGroupByFieldId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">None — one total</option>
                  {anyFields.filter((f) => f.id !== metricFieldId).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-1">
              {computing ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing…
                </div>
              ) : error ? (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              ) : result && result.groups.length === 1 && result.groups[0].key === "total" ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-5 text-center">
                  <p className="text-3xl font-bold text-slate-900 tabular-nums">{formatNumber(result.groups[0].value)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {operation} of {selectedMetricField?.name}
                  </p>
                </div>
              ) : result && result.groups.length > 0 ? (
                <BarChart
                  data={result.groups.map((g) => ({ label: g.key, value: g.value }))}
                  formatValue={formatNumber}
                />
              ) : result ? (
                <p className="text-xs text-slate-500 py-2">No entries have this field filled in yet.</p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* Over Time */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-600" /> Over Time
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {plottedFieldName
              ? `Total ${plottedFieldName} across entries, added up per ${bucket} by each entry's ${dateFieldName}.`
              : `How many entries have a ${dateFieldName} value, counted per ${bucket}.`}
          </p>
        </div>

        {loadingFields ? (
          <p className="text-xs text-slate-500">Loading fields…</p>
        ) : dateFields.length === 0 ? (
          <p className="text-xs text-slate-500">
            This project has no Date fields, so there's nothing to place on a timeline yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Date field</label>
                <select
                  value={dateFieldId}
                  onChange={(e) => setDateFieldId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  {dateFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Plot</label>
                <select
                  value={timelinePlot}
                  onChange={(e) => setTimelinePlot(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value={COUNT_MODE}>Number of entries</option>
                  {numericFields.map((f) => (
                    <option key={f.id} value={f.id}>Total {f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                {(["day", "week", "month"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBucket(b)}
                    className={`px-3 py-2 text-xs font-medium capitalize transition ${
                      bucket === b ? "bg-cyan-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1">
              {computingTimeline ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-8">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing…
                </div>
              ) : timelineError ? (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{timelineError}</p>
              ) : timeline && timeline.points.length > 0 ? (
                <TrendChart
                  data={timeline.points.map((p) => ({ label: p.date, value: p.value }))}
                  formatValue={plottedFieldName ? formatNumber : (v) => String(Math.round(v))}
                />
              ) : timeline ? (
                <p className="text-xs text-slate-500 py-2">No dated entries yet.</p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* Custom Expression (US16) — one number across the whole project */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Sigma className="h-4 w-4 text-cyan-600" /> Custom Expression
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Your own calculation over every entry in this project — for example
            {" "}
            <span className="font-mono text-slate-600">SUM(&#123;Hours&#125;) / COUNT()</span>.
          </p>
        </div>

        {loadingFields ? (
          <p className="text-xs text-slate-500">Loading fields…</p>
        ) : (
          <>
            <form onSubmit={runExpression} className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[240px]">
                <label htmlFor="custom-expression" className="block text-[11px] font-medium text-slate-500 mb-1">
                  Expression
                </label>
                <input
                  id="custom-expression"
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="SUM({Hours}) / COUNT()"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
              </div>
              <button
                type="submit"
                disabled={evaluating || !expression.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Calculate
              </button>
            </form>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
              <div>
                <p className="font-medium text-slate-500 mb-1">Fields you can use</p>
                {numericFields.length === 0 ? (
                  <p className="text-slate-500">
                    This project has no Number or Computed fields yet, so only COUNT() will work.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {numericFields.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setExpression((current) => `${current}${referenceFor(f.name)}`)}
                        title={`Add ${f.name} to the expression`}
                        className="px-2 py-0.5 rounded-md font-mono bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition"
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium text-slate-500 mb-1">Functions</p>
                <div className="flex flex-wrap gap-1">
                  {["COUNT()", "SUM(field)", "AVG(field)", "MIN(field)", "MAX(field)"].map((fn) => (
                    <span
                      key={fn}
                      className="px-2 py-0.5 rounded-md font-mono bg-slate-100 text-slate-600 border border-slate-200"
                    >
                      {fn}
                    </span>
                  ))}
                </div>
                <p className="text-slate-500 mt-1">with + - * / and parentheses</p>
              </div>
            </div>

            <div className="pt-1">
              {evaluating ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating…
                </div>
              ) : expressionError ? (
                <p role="alert" className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {expressionError}
                </p>
              ) : expressionValue !== null ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-5 text-center">
                  <p className="text-3xl font-bold text-slate-900 tabular-nums">{formatNumber(expressionValue)}</p>
                  <p className="text-xs text-slate-500 mt-1 font-mono break-all">{evaluatedExpression}</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
