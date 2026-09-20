import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, TrendingUp, Loader2 } from "lucide-react";
import { api } from "../api/client";

type GroupResult = { groups: { key: string; value: number }[] };
type TimelineResult = { points: { date: string; count: number }[] };

const OPERATIONS = ["sum", "avg", "count", "min", "max"] as const;
type Operation = typeof OPERATIONS[number];

export default function StatsPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [metricFieldId, setMetricFieldId] = useState<string>("");
  const [operation, setOperation] = useState<Operation>("sum");
  const [groupByFieldId, setGroupByFieldId] = useState<string>("");

  const [result, setResult] = useState<GroupResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    api.get("/projects").then((res) => {
      setProjects(res.data);
      if (!params.get("project") && res.data.length > 0) {
        setParams({ project: res.data[0].id });
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    api.get(`/projects/${selectedProjectId}/entry-fields`).then((res) => {
      setFields(res.data);
      setMetricFieldId("");
      setGroupByFieldId("");
      setResult(null);
      setTimeline(null);
    }).catch(() => setFields([]));
  }, [selectedProjectId]);

  const numericFields = useMemo(() => fields.filter((f) => f.type === "NUMBER"), [fields]);
  const dateFields = useMemo(() => fields.filter((f) => f.type === "DATE"), [fields]);
  const anyFields = useMemo(() => fields.filter((f) => f.type !== "COMPUTED"), [fields]);

  const runGroup = async () => {
    if (!selectedProjectId || !metricFieldId || !operation) return;
    setComputing(true);
    setError(null);
    setResult(null);
    try {
      const body: any = { metricFieldId, operation };
      if (groupByFieldId) body.groupByFieldId = groupByFieldId;
      const res = await api.post(`/projects/${selectedProjectId}/stats/group`, body);
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to compute stats");
    } finally {
      setComputing(false);
    }
  };

  const runTimeline = async (dateFieldId: string, bucket: "day" | "week" | "month") => {
    if (!selectedProjectId) return;
    setComputing(true);
    setError(null);
    setTimeline(null);
    try {
      const res = await api.post(`/projects/${selectedProjectId}/stats/timeline`, {
        dateFieldId,
        bucket,
      });
      setTimeline(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to compute timeline");
    } finally {
      setComputing(false);
    }
  };

  if (loadingProjects) {
    return <p className="text-sm text-slate-500">Loading projects…</p>;
  }

  if (projects.length === 0) {
    return <p className="text-sm text-slate-500">No projects yet. Create one to see stats.</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-cyan-600" />
        <h1 className="text-xl font-semibold text-slate-900">Statistics</h1>
      </div>

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

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Total / Group</h2>
        {numericFields.length === 0 ? (
          <p className="text-xs text-slate-500">This project has no NUMBER fields to aggregate.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Metric field</label>
                <select
                  value={metricFieldId}
                  onChange={(e) => setMetricFieldId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose…</option>
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
                  <option value="">None</option>
                  {anyFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={runGroup}
              disabled={!metricFieldId || computing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Compute
            </button>
          </>
        )}

        {result && (
          <div className="pt-2">
            <ul className="space-y-1.5">
              {result.groups.map((g) => (
                <li key={g.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <span className="text-sm text-slate-700">{g.key}</span>
                  <span className="text-sm font-semibold text-slate-900">{g.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-600" /> Over Time
        </h2>
        {dateFields.length === 0 ? (
          <p className="text-xs text-slate-500">This project has no DATE fields for a timeline.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dateFields.map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <span className="text-xs text-slate-600">{f.name}:</span>
                {(["day", "week", "month"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => runTimeline(f.id, b)}
                    className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                  >
                    {b}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {timeline && (
          <ul className="space-y-1 pt-2">
            {timeline.points.map((p) => (
              <li key={p.date} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5">
                <span className="text-xs text-slate-700">{p.date}</span>
                <span className="text-xs font-semibold text-slate-900">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}