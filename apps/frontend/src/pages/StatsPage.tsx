import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, TrendingUp, Loader2, Clock } from "lucide-react";
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

  // Show something the moment fields load, rather than an empty control panel.
  useEffect(() => {
    if (numericFields.length > 0 && !metricFieldId) {
      setMetricFieldId(numericFields[0].id);
    }
  }, [numericFields, metricFieldId]);

  useEffect(() => {
    if (dateFields.length > 0 && !dateFieldId) {
      setDateFieldId(dateFields[0].id);
    }
  }, [dateFields, dateFieldId]);

  const runGroup = async () => {
    if (!selectedProjectId || !metricFieldId || !operation) return;
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
        ) : numericFields.length === 0 ? (
          <p className="text-xs text-slate-500">
            This project has no Number or Computed fields to total yet — add one to a field to see it here.
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
                  {numericFields.map((f) => (
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
                  {OPERATIONS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
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
                    {operation} of {numericFields.find((f) => f.id === metricFieldId)?.name}
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
    </div>
  );
}
