import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, TrendingUp, Loader2, Clock, Sigma, Bookmark, Pencil, Trash2 } from "lucide-react";
import { api } from "../api/client";
import {
  fetchProjects,
  fetchEntryFields,
  fetchAllProjectTimeSummaries,
  type Project,
  type EntryField,
} from "../api";
import { formatDuration } from "../lib/utils";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { button } from "../lib/ui";
import Modal from "../components/Modal";
import BarChart from "../components/BarChart";
import TrendChart from "../components/TrendChart";

type GroupResult = { groups: { key: string; value: number }[] };
type TimelineResult = { points: { date: string; value: number }[] };
type Bucket = "day" | "week" | "month";
type SavedStatistic = {
  id: string;
  name: string;
  expression: string;
  value: number | null;
  error: string | null;
};

const OPERATIONS = ["sum", "avg", "count", "min", "max"] as const;
type Operation = typeof OPERATIONS[number];

const COUNT_MODE = "__count__";

/**
 * The value sent to the timeline endpoint that plots each entry by its own
 * date (entryDate, falling back to the day it was created) rather than by a
 * DATE field's value. Mirrors the reserved literal the backend accepts, and
 * is what makes a project without any DATE field plottable.
 */
const ENTRY_DATE_OPTION = "ENTRY_DATE";

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

  // Saved statistics (US17). Only the definition is stored server-side; the
  // value on each one is worked out fresh whenever the list is fetched.
  const [saved, setSaved] = useState<SavedStatistic[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  // The statistic being written: null when the dialog is closed, an id of "" 
  // when it is a new one.
  const [draft, setDraft] = useState<{ id: string; name: string; expression: string } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedStatistic | null>(null);

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
    fetchAllProjectTimeSummaries()
      .then((rows) => {
        if (cancelled) return;
        const minutesById = new Map(rows.map((s) => [s.projectId, s.totalMinutes]));
        setProjectTimes(
          active.map((p) => ({ label: p.name, value: minutesById.get(p.id) ?? 0 }))
            .sort((a, b) => b.value - a.value)
        );
      })
      .catch(() => {
        if (!cancelled) setProjectTimes(active.map((p) => ({ label: p.name, value: 0 })));
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
    if (!dateFieldId) {
      // Prefer a DATE field when the project has one; otherwise plot by the
      // day each entry was logged, which every entry has.
      setDateFieldId(dateFields[0]?.id ?? ENTRY_DATE_OPTION);
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

  const loadSaved = useCallback(async (projectId: string) => {
    setLoadingSaved(true);
    setSavedError(null);
    try {
      const res = await api.get(`/projects/${projectId}/custom-statistics`);
      setSaved(res.data);
    } catch (err: any) {
      setSavedError(err?.response?.data?.error ?? "Could not load your saved statistics");
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) void loadSaved(selectedProjectId);
  }, [selectedProjectId, loadSaved]);

  const submitDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !selectedProjectId) return;
    setSavingDraft(true);
    setDraftError(null);
    try {
      const body = { name: draft.name.trim(), expression: draft.expression.trim() };
      if (draft.id) {
        await api.patch(`/projects/${selectedProjectId}/custom-statistics/${draft.id}`, body);
      } else {
        await api.post(`/projects/${selectedProjectId}/custom-statistics`, body);
      }
      setDraft(null);
      await loadSaved(selectedProjectId);
    } catch (err: any) {
      // The server checks the expression with the same parser the panel
      // above uses, so its complaint is the one worth showing.
      setDraftError(err?.response?.data?.error ?? "Could not save that statistic");
    } finally {
      setSavingDraft(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !selectedProjectId) return;
    try {
      await api.delete(`/projects/${selectedProjectId}/custom-statistics/${deleting.id}`);
      setDeleting(null);
      await loadSaved(selectedProjectId);
    } catch (err: any) {
      setSavedError(err?.response?.data?.error ?? "Could not delete that statistic");
      setDeleting(null);
    }
  };

  const plottedFieldName =
    timelinePlot !== COUNT_MODE ? fields.find((f) => f.id === timelinePlot)?.name : null;
  const plottingByEntryDate = dateFieldId === ENTRY_DATE_OPTION;
  const dateFieldName = fields.find((f) => f.id === dateFieldId)?.name ?? "date";

  if (loadingProjects) {
    return (
      <div className="space-y-6 max-w-3xl" aria-busy="true">
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

  if (projects.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Statistics" subtitle="How you're working: your time and what your own fields add up to." />
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
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Statistics"
        subtitle="How you're working: time per project, and whatever your own fields can total, group or plot."
      />

      {/* Time per project — the headline, no setup required */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
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
        <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-400" aria-hidden="true" />
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Field</label>
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Operation</label>
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Group by (optional)</label>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden="true" /> Over Time
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {plottingByEntryDate
              ? plottedFieldName
                ? `Total ${plottedFieldName} across entries, added up per ${bucket} by the day each was logged.`
                : `How many entries were logged, per ${bucket}.`
              : plottedFieldName
                ? `Total ${plottedFieldName} across entries, added up per ${bucket} by each entry's ${dateFieldName}.`
                : `How many entries have a ${dateFieldName} value, counted per ${bucket}.`}
          </p>
        </div>

        {loadingFields ? (
          <p className="text-xs text-slate-500">Loading fields…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date field</label>
                <select
                  value={dateFieldId}
                  onChange={(e) => setDateFieldId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  {dateFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                  {/* Always offered: an entry is dated by the day it was logged
                      whether or not its project defines a DATE field. */}
                  <option value={ENTRY_DATE_OPTION}>Entry date</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Plot</label>
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
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Sigma className="h-4 w-4 text-slate-400" aria-hidden="true" /> Custom Expression
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
                <label htmlFor="custom-expression" className="block text-xs font-medium text-slate-500 mb-1">
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
                  <button
                    type="button"
                    onClick={() => {
                      setDraftError(null);
                      setDraft({ id: "", name: "", expression: evaluatedExpression });
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Bookmark className="h-3.5 w-3.5" /> Save as statistic
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* My Custom Statistics (US17) — saved definitions, valued right now */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-slate-400" aria-hidden="true" /> My Custom Statistics
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Your own saved calculations. Each one is worked out again from the current entries,
            so the numbers keep up as you log more work.
          </p>
        </div>

        {loadingSaved ? (
          <p className="text-xs text-slate-500">Loading your statistics…</p>
        ) : savedError ? (
          <p role="alert" className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {savedError}
          </p>
        ) : saved.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nothing saved yet. Work out an expression above, then choose “Save as statistic”.
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((statistic) => (
              <li
                key={statistic.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{statistic.name}</p>
                  {statistic.error ? (
                    // A saved statistic can stop working — its field may have
                    // been renamed since — so it says so instead of vanishing.
                    <p className="text-xs text-red-600 mt-0.5">{statistic.error}</p>
                  ) : (
                    <p className="text-xl font-bold text-slate-900 tabular-nums leading-tight">
                      {statistic.value === null ? "—" : formatNumber(statistic.value)}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{statistic.expression}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftError(null);
                      setDraft({ id: statistic.id, name: statistic.name, expression: statistic.expression });
                    }}
                    title={`Edit ${statistic.name}`}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 transition"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(statistic)}
                    title={`Delete ${statistic.name}`}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit statistic" : "Save custom statistic"}
      >
        <form onSubmit={submitDraft} className="space-y-3">
          <div>
            <label htmlFor="statistic-name" className="block text-xs font-medium text-slate-500 mb-1">
              Name
            </label>
            <input
              id="statistic-name"
              value={draft?.name ?? ""}
              onChange={(e) => setDraft((current) => (current ? { ...current, name: e.target.value } : current))}
              placeholder="Average Hours Per Entry"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>
          <div>
            <label htmlFor="statistic-expression" className="block text-xs font-medium text-slate-500 mb-1">
              Expression
            </label>
            <input
              id="statistic-expression"
              value={draft?.expression ?? ""}
              onChange={(e) => setDraft((current) => (current ? { ...current, expression: e.target.value } : current))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Saved against this project, and worked out again every time it is shown.</p>
          </div>
          {draftError && (
            <p role="alert" className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {draftError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDraft || !draft?.name.trim() || !draft?.expression.trim()}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {savingDraft ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete statistic">
        <p className="text-sm text-slate-700">
          Delete “{deleting?.name}”? The expression is removed; nothing you have logged is touched.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
