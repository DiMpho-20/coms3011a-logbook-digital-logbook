import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../../api/client";
import {
  fetchProjects,
  fetchEntryFields,
  fetchAllProjectTimeSummaries,
  type Project,
  type EntryField,
} from "../../api";
import {
  COUNT_MODE,
  ENTRY_DATE_OPTION,
  OPERATIONS,
  periodLabel,
  type Bucket,
  type GroupResult,
  type Operation,
  type TimelineResult,
} from "./format";

export interface ProjectStats {
  projects: Project[];
  selectedProjectId: string;
  selectProject: (id: string) => void;
  loadingProjects: boolean;
  projectsFailed: boolean;
  loadProjects: () => void;

  fields: EntryField[];
  loadingFields: boolean;
  numericFields: EntryField[];
  dateFields: EntryField[];
  anyFields: EntryField[];

  projectTimes: { label: string; value: number }[] | null;
  projectTimesFailed: boolean;

  metricFieldId: string;
  setMetricFieldId: Dispatch<SetStateAction<string>>;
  operation: Operation;
  setOperation: Dispatch<SetStateAction<Operation>>;
  groupByFieldId: string;
  setGroupByFieldId: Dispatch<SetStateAction<string>>;
  selectedMetricField: EntryField | undefined;
  isNumericMetric: boolean;
  availableOperations: readonly Operation[];
  result: GroupResult | null;
  computing: boolean;
  error: string | null;

  dateFieldId: string;
  setDateFieldId: Dispatch<SetStateAction<string>>;
  timelinePlot: string;
  setTimelinePlot: Dispatch<SetStateAction<string>>;
  bucket: Bucket;
  setBucket: Dispatch<SetStateAction<Bucket>>;
  timeline: TimelineResult | null;
  computingTimeline: boolean;
  timelineError: string | null;
  plottedFieldName: string | null;
  plottingByEntryDate: boolean;
  dateFieldName: string;
  timelineRange: string | null;

  expression: string;
  setExpression: Dispatch<SetStateAction<string>>;
  expressionValue: number | null;
  evaluatedExpression: string;
  evaluating: boolean;
  expressionError: string | null;
  runExpression: (event: FormEvent) => Promise<void>;
}

/**
 * Everything the statistics page works out for the selected project: which
 * projects and fields exist, the cross-project time overview, and the three
 * calculations (breakdown, over time, a typed expression).
 *
 * The page is otherwise a set of panels; the requests and the controls they
 * mirror live here so a panel only has to render what it is handed.
 */
export function useProjectStats(): ProjectStats {
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

  /**
   * A `?project=` in the address names the project once one has been chosen;
   * until then the first project stands in for it, so the page has something
   * to show without rewriting the address on load.
   */
  const selectedProjectId = params.get("project") ?? projects[0]?.id ?? "";
  const selectProject = useCallback((id: string) => setParams({ project: id }), [setParams]);

  const loadProjects = useCallback(() => {
    setLoadingProjects(true);
    setProjectsFailed(false);
    fetchProjects()
      .then((data) => {
        setProjects(data);
        setLoadingProjects(false);
      })
      .catch(() => {
        setProjectsFailed(true);
        setLoadingProjects(false);
      });
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
  const availableOperations: readonly Operation[] = isNumericMetric ? OPERATIONS : (["count"] as const);

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

  /**
   * These two effects react to the controls a student turns — and to nothing
   * else. They must not re-run just because the project changed: the old
   * project's fields are still in state for a render or two, and posting one
   * of those ids to the new project would only earn a 400. The latest
   * closure is reached through a ref so each run still reads current state.
   */
  const runGroupRef = useRef(runGroup);
  runGroupRef.current = runGroup;

  useEffect(() => {
    if (metricFieldId) void runGroupRef.current();
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

  const runTimelineRef = useRef(runTimeline);
  runTimelineRef.current = runTimeline;

  useEffect(() => {
    if (dateFieldId) void runTimelineRef.current(dateFieldId, bucket, timelinePlot);
  }, [dateFieldId, bucket, timelinePlot]);

  const runExpression = async (event: FormEvent) => {
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
    timelinePlot !== COUNT_MODE ? (fields.find((f) => f.id === timelinePlot)?.name ?? null) : null;
  const plottingByEntryDate = dateFieldId === ENTRY_DATE_OPTION;
  const dateFieldName = fields.find((f) => f.id === dateFieldId)?.name ?? "date";
  const timelineRange =
    timeline && timeline.points.length > 0
      ? `${periodLabel(timeline.points[0].date, bucket)} to ${periodLabel(timeline.points[timeline.points.length - 1].date, bucket)}`
      : null;

  return {
    projects,
    selectedProjectId,
    selectProject,
    loadingProjects,
    projectsFailed,
    loadProjects,
    fields,
    loadingFields,
    numericFields,
    dateFields,
    anyFields,
    projectTimes,
    projectTimesFailed,
    metricFieldId,
    setMetricFieldId,
    operation,
    setOperation,
    groupByFieldId,
    setGroupByFieldId,
    selectedMetricField,
    isNumericMetric,
    availableOperations,
    result,
    computing,
    error,
    dateFieldId,
    setDateFieldId,
    timelinePlot,
    setTimelinePlot,
    bucket,
    setBucket,
    timeline,
    computingTimeline,
    timelineError,
    plottedFieldName,
    plottingByEntryDate,
    dateFieldName,
    timelineRange,
    expression,
    setExpression,
    expressionValue,
    evaluatedExpression,
    evaluating,
    expressionError,
    runExpression,
  };
}
