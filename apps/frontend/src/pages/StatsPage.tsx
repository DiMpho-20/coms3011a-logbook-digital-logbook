import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, Loader2, Bookmark, Pencil, Trash2, Plus, CircleAlert } from "lucide-react";
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

/** The operations, in words. The values sent to the server are unchanged. */
const OPERATION_LABELS: Record<Operation, string> = {
  sum: "Total",
  avg: "Average",
  count: "Count",
  min: "Lowest",
  max: "Highest",
};

const asDay = (iso: string) => new Date(`${iso}T00:00:00`);
const shortDay = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A bucket's start date, as a reader would name the period: "Sep 3", "Sep 1–7", "Sep 2026". */
function periodLabel(iso: string, bucket: Bucket): string {
  const start = asDay(iso);
  if (bucket === "day") return shortDay(start);
  if (bucket === "month") return start.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return start.getMonth() === end.getMonth()
    ? `${shortDay(start)}–${end.getDate()}`
    : `${shortDay(start)} – ${shortDay(end)}`;
}

const selectClass =
  "w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const labelClass = "block text-xs font-medium text-slate-600 mb-1";

/**
 * Label, a thin bar for its share of the largest value, and the value itself.
 * One row per item with hairline dividers; the bar is in the accent colour.
 */
function MeterList({ data, formatValue }: { data: { label: string; value: number }[]; formatValue: (v: number) => string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <ul className="divide-y divide-slate-100">
      {data.map((d, i) => {
        const pct = Math.min((Math.abs(d.value) / max) * 100, 100);
        return (
          <li
            key={`${d.label}-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem]"
          >
            <span className="truncate text-sm text-slate-700" title={d.label}>{d.label}</span>
            <span className="text-right text-sm font-semibold tabular-nums text-slate-900 sm:order-3">{formatValue(d.value)}</span>
            <div
              className="col-span-2 h-1.5 rounded-full bg-slate-100 sm:order-2 sm:col-span-1"
              role="img"
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${pct}%`, minWidth: d.value !== 0 ? "3px" : 0 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A white card with a heading, a line of context, and an optional action on the right. */
function Panel({ title, description, action, children, level = 2 }: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="text-[15px] font-semibold text-slate-900">{title}</Heading>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [projectTimesFailed, setProjectTimesFailed] = useState(false);

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

  const loadProjects = useCallback(() => {
    setLoadingProjects(true);
    setProjectsFailed(false);
    fetchProjects()
      .then((data) => {
        setProjects(data);
        if (!params.get("project") && data.length > 0) {
          setParams({ project: data[0].id });
        }
        setLoadingProjects(false);
      })
      .catch(() => {
        setProjectsFailed(true);
        setLoadingProjects(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Time logged per active project — independent of which one is "selected".
  useEffect(() => {
    const active = projects.filter((p) => p.status === "ACTIVE");
    if (active.length === 0) {
      setProjectTimes(active.length === 0 && projects.length > 0 ? [] : null);
      return;
    }
    let cancelled = false;
    setProjectTimesFailed(false);
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
        // Say it failed, rather than drawing every project at zero.
        if (!cancelled) setProjectTimesFailed(true);
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
  const timelineRange =
    timeline && timeline.points.length > 0
      ? `${periodLabel(timeline.points[0].date, bucket)} to ${periodLabel(timeline.points[timeline.points.length - 1].date, bucket)}`
      : null;

  const openNewStatistic = (expressionText = "") => {
    setDraftError(null);
    setDraft({ id: "", name: "", expression: expressionText });
  };

  const header = (
    <PageHeader title="Statistics" subtitle="How you're working, and whatever your own fields can add up." />
  );

  if (loadingProjects) {
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

  if (projectsFailed) {
    return (
      <div className="space-y-6 max-w-5xl">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={CircleAlert}
            title="Your projects couldn't be loaded"
            description="Statistics are worked out per project, so there's nothing to show yet. Check your connection and try again."
            action={<button onClick={loadProjects} className={button("secondary")}>Try again</button>}
          />
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
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

  const loadingLine = (text: string) => (
    <div className="flex items-center gap-2 py-4 text-xs text-slate-500" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {text}
    </div>
  );
  // Only errors from something the student just did are announced; panel load errors are not.
  const errorLine = (text: string, announce = true) => (
    <p role={announce ? "alert" : undefined} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{text}</p>
  );

  return (
    <div className="space-y-8 max-w-5xl">
      {header}

      {/* ── 1. Time logged: the headline, no setup ─────────────────────── */}
      <Panel title="Time logged" description="Across all projects">
        {projectTimesFailed ? (
          <p className="text-sm text-slate-500">Time per project couldn't be loaded just now. Reload the page to try again.</p>
        ) : projectTimes === null ? (
          loadingLine("Loading…")
        ) : projectTimes.every((p) => p.value === 0) ? (
          <p className="text-sm text-slate-500">No time logged yet — entries you add will show up here.</p>
        ) : (
          <MeterList data={projectTimes.filter((p) => p.value > 0)} formatValue={formatDuration} />
        )}
      </Panel>

      {/* ── 2. Project statistics: the selector, then what it controls ─── */}
      <section aria-labelledby="project-statistics-heading" className="space-y-4">
        <div className="border-t border-slate-200 pt-6">
          <h2 id="project-statistics-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Project statistics
          </h2>
          <div className="mt-3 max-w-sm">
            <label htmlFor="stats-project" className={labelClass}>Project</label>
            <select
              id="stats-project"
              value={selectedProjectId}
              onChange={(e) => setParams({ project: e.target.value })}
              aria-describedby="stats-project-hint"
              className={selectClass}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <p id="stats-project-hint" className="mt-1.5 text-xs text-slate-500">The sections below are calculated for this project.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          {/* ── 3. Breakdown ─────────────────────────────────────────── */}
          <Panel level={3} title="Breakdown" description="What a field adds up to, in total or split by another field.">
            {loadingFields ? (
              <p className="text-xs text-slate-500">Loading fields…</p>
            ) : fields.length === 0 ? (
              <p className="text-sm text-slate-500">
                This project has no entry fields yet — add one to see it here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="breakdown-measure" className={labelClass}>Measure</label>
                    <select id="breakdown-measure" value={metricFieldId} onChange={(e) => setMetricFieldId(e.target.value)} className={selectClass}>
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="breakdown-operation" className={labelClass}>Calculate</label>
                    <select
                      id="breakdown-operation"
                      value={operation}
                      onChange={(e) => setOperation(e.target.value as Operation)}
                      aria-describedby={!isNumericMetric ? "breakdown-operation-hint" : undefined}
                      className={selectClass}
                    >
                      {availableOperations.map((op) => (
                        <option key={op} value={op}>{OPERATION_LABELS[op]}</option>
                      ))}
                    </select>
                    {!isNumericMetric && (
                      <p id="breakdown-operation-hint" className="mt-1 text-[11px] text-slate-500">Only count works on a non-number field.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="breakdown-group" className={labelClass}>Group by</label>
                    <select id="breakdown-group" value={groupByFieldId} onChange={(e) => setGroupByFieldId(e.target.value)} className={selectClass}>
                      <option value="">Nothing — one total</option>
                      {anyFields.filter((f) => f.id !== metricFieldId).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  {computing ? (
                    loadingLine("Computing…")
                  ) : error ? (
                    errorLine(error, false)
                  ) : result && result.groups.length === 1 && result.groups[0].key === "total" ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(result.groups[0].value)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {OPERATION_LABELS[operation]} of {selectedMetricField?.name}
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

          {/* ── 4. Over time ─────────────────────────────────────────── */}
          <Panel
            level={3}
            title="Over time"
            description={
              plottingByEntryDate
                ? plottedFieldName
                  ? `Total ${plottedFieldName} across entries, added up per ${bucket} by the day each was logged.`
                  : `How many entries were logged, per ${bucket}.`
                : plottedFieldName
                  ? `Total ${plottedFieldName} across entries, added up per ${bucket} by each entry's ${dateFieldName}.`
                  : `How many entries have a ${dateFieldName} value, counted per ${bucket}.`
            }
          >
            {loadingFields ? (
              <p className="text-xs text-slate-500">Loading fields…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor="timeline-date" className={labelClass}>Date</label>
                    <select id="timeline-date" value={dateFieldId} onChange={(e) => setDateFieldId(e.target.value)} className={selectClass}>
                      {dateFields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                      {/* Always offered: an entry is dated by the day it was logged
                          whether or not its project defines a DATE field. */}
                      <option value={ENTRY_DATE_OPTION}>Entry date</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="timeline-plot" className={labelClass}>Plot</label>
                    <select id="timeline-plot" value={timelinePlot} onChange={(e) => setTimelinePlot(e.target.value)} className={selectClass}>
                      <option value={COUNT_MODE}>Number of entries</option>
                      {numericFields.map((f) => (
                        <option key={f.id} value={f.id}>Total {f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div role="group" aria-label="Period" className="flex h-10 overflow-hidden rounded-lg border border-slate-200">
                    {(["day", "week", "month"] as const).map((b) => (
                      <button
                        key={b}
                        onClick={() => setBucket(b)}
                        aria-pressed={bucket === b}
                        className={`flex-1 px-3 text-xs font-medium capitalize transition-colors duration-150 ${
                          bucket === b ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  {computingTimeline ? (
                    loadingLine("Computing…")
                  ) : timelineError ? (
                    errorLine(timelineError, false)
                  ) : timeline && timeline.points.length > 0 ? (
                    <>
                      <TrendChart
                        accent
                        data={timeline.points.map((p) => ({ label: periodLabel(p.date, bucket), value: p.value }))}
                        formatValue={plottedFieldName ? formatNumber : (v) => String(Math.round(v))}
                      />
                      {timelineRange && (
                        <p className="mt-1 text-xs text-slate-500">
                          {timelineRange}, per {bucket}. Periods with nothing logged are skipped.
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
        </div>

        {/* ── 5. Saved statistics ──────────────────────────────────────── */}
        <Panel
          level={3}
          title="Your saved statistics"
          description="Your own calculations for this project, worked out again from the current entries each time."
          action={
            saved.length > 0 && (
              <button type="button" onClick={() => openNewStatistic()} className={button("secondary", "sm")}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New statistic
              </button>
            )
          }
        >
          {loadingSaved ? (
            <p className="text-xs text-slate-500">Loading your statistics…</p>
          ) : savedError ? (
            errorLine(savedError)
          ) : saved.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-800">No saved statistics yet</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Create one when you want to calculate something custom.
              </p>
              <button type="button" onClick={() => openNewStatistic()} className={`${button("secondary", "sm")} mt-3`}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New statistic
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {saved.map((statistic) => (
                <li key={statistic.id} className="flex flex-col rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-semibold text-slate-900">{statistic.name}</p>
                    <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftError(null);
                          setDraft({ id: statistic.id, name: statistic.name, expression: statistic.expression });
                        }}
                        aria-label={`Edit ${statistic.name}`}
                        title={`Edit ${statistic.name}`}
                        className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(statistic)}
                        aria-label={`Delete ${statistic.name}`}
                        title={`Delete ${statistic.name}`}
                        className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{statistic.expression}</p>
                  {statistic.error ? (
                    // A saved statistic can stop working — its field may have
                    // been renamed since — so it says so instead of vanishing.
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700">
                      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{statistic.error}</span>
                    </p>
                  ) : (
                    <p className="mt-3 text-2xl font-semibold tabular-nums leading-tight text-slate-900">
                      {statistic.value === null ? "—" : formatNumber(statistic.value)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Trying an expression before saving it (US16) */}
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
          {loadingFields ? (
            <p className="text-xs text-slate-500">Loading fields…</p>
          ) : (
            <>
              <form onSubmit={runExpression} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label htmlFor="custom-expression" className={labelClass}>
                    Expression
                  </label>
                  <input
                    id="custom-expression"
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    placeholder="SUM({Hours}) / COUNT()"
                    className={`${selectClass} font-mono`}
                  />
                </div>
                <button type="submit" disabled={evaluating || !expression.trim()} className={button("primary")}>
                  Calculate
                </button>
              </form>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
                <div>
                  <p className="mb-1 font-medium text-slate-500">Fields you can use</p>
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
                    {["COUNT()", "SUM(field)", "AVG(field)", "MIN(field)", "MAX(field)"].map((fn) => (
                      <span key={fn} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-600">
                        {fn}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-slate-500">with + - * / and parentheses</p>
                </div>
              </div>

              <div>
                {evaluating ? (
                  loadingLine("Calculating…")
                ) : expressionError ? (
                  errorLine(expressionError)
                ) : expressionValue !== null ? (
                  <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(expressionValue)}</p>
                      <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{evaluatedExpression}</p>
                    </div>
                    <button type="button" onClick={() => openNewStatistic(evaluatedExpression)} className={button("secondary", "sm")}>
                      <Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Save as statistic
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </Panel>
      </section>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit statistic" : "New statistic"}
      >
        <form onSubmit={submitDraft} className="space-y-3">
          <div>
            <label htmlFor="statistic-name" className={labelClass}>
              Name
            </label>
            <input
              id="statistic-name"
              value={draft?.name ?? ""}
              onChange={(e) => setDraft((current) => (current ? { ...current, name: e.target.value } : current))}
              placeholder="Average Hours Per Entry"
              className={selectClass}
            />
          </div>
          <div>
            <label htmlFor="statistic-expression" className={labelClass}>
              Expression
            </label>
            <input
              id="statistic-expression"
              value={draft?.expression ?? ""}
              onChange={(e) => setDraft((current) => (current ? { ...current, expression: e.target.value } : current))}
              placeholder="SUM({Hours}) / COUNT()"
              className={`${selectClass} font-mono`}
            />
            <p className="mt-1 text-[11px] text-slate-500">Saved against this project, and worked out again every time it is shown.</p>
          </div>
          {draftError && errorLine(draftError)}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setDraft(null)} className={button("secondary")}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDraft || !draft?.name.trim() || !draft?.expression.trim()}
              className={button("primary")}
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
          <button type="button" onClick={() => setDeleting(null)} className={button("secondary")}>
            Cancel
          </button>
          <button type="button" onClick={confirmDelete} className={button("danger")}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
