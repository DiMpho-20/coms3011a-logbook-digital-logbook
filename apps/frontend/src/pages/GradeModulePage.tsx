import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import type { AssessmentSection, GradeAssessment } from "@logbook/shared";
import Card from "../components/Card";
import Stat from "../components/Stat";
import StatusChip from "../components/StatusChip";
import Skeleton from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import ModuleFormModal from "../components/grades/ModuleFormModal";
import AssessmentFormModal from "../components/grades/AssessmentFormModal";
import TargetPanel from "../components/grades/TargetPanel";
import WhatIfPanel from "../components/grades/WhatIfPanel";
import CalculationExplainer from "../components/grades/CalculationExplainer";
import GradeBar from "../components/grades/GradeBar";
import { AssessmentStatusBadge, TargetStatusBadge } from "../components/grades/GradeBadges";
import { deleteAssessment, deleteGradeModule, fetchGradeModule, updateGradeModule, type GradeModule } from "../api";
import { useConfirm } from "../lib/useConfirm";
import { button } from "../lib/ui";
import {
  assessmentStatus,
  computeModule,
  formatMark,
  formatPercent,
  formatPoints,
  formatRequired,
  formatSecured,
  formatWeight,
  type AssessmentRow,
  type SectionSummary,
} from "../lib/grades";
import {
  DATE_KIND_LABEL,
  UNOFFICIAL_NOTE,
  apiError,
  awaitingMark,
  countdownLabel,
  daysUntil,
  formatDay,
  moduleTypeLabel,
} from "../lib/gradeDisplay";

type AssessmentDialog = { assessment?: GradeAssessment; section?: AssessmentSection } | null;

/** Desktop columns: assessment, weight, mark, contribution, status, actions. Phones stack them. */
const ROW_GRID = "sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]";

function WeightTotal({ section }: { section: SectionSummary }) {
  if (section.assessmentCount === 0) return <StatusChip>No assessments yet</StatusChip>;
  if (section.weightsComplete) {
    return (
      <StatusChip tone="success" icon={CheckCircle2}>
        Weights total {formatWeight(section.weightTotal)}
      </StatusChip>
    );
  }
  const gap = section.unassignedWeight;
  return (
    <StatusChip tone="caution" icon={AlertTriangle}>
      Weights total {formatWeight(section.weightTotal)} · {formatWeight(Math.abs(gap))} {gap > 0 ? "unassigned" : "too much"}
    </StatusChip>
  );
}

function DateLine({ assessment }: { assessment: GradeAssessment }) {
  if (!assessment.date) return null;
  const days = daysUntil(assessment.date);
  const pending = assessmentStatus(assessment) === "PENDING";
  const KindIcon = assessment.dateKind === "TEST" ? ClipboardCheck : FileText;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
      <KindIcon className="h-3 w-3" aria-hidden="true" />
      {DATE_KIND_LABEL[assessment.dateKind ?? "DUE"]} {formatDay(assessment.date)}
      {pending && days >= 0 && <span className="text-blue-600"> · {countdownLabel(days)}</span>}
    </p>
  );
}

/** A label shown beside a value on phones, where there is no column header above it. */
const MobileLabel = ({ children }: { children: string }) => (
  <span className="text-xs text-slate-500 sm:hidden">{children} </span>
);

function AssessmentList({
  module,
  section,
  rows,
  onEdit,
  onDelete,
}: {
  module: GradeModule;
  section: SectionSummary;
  rows: AssessmentRow[];
  onEdit: (assessment: GradeAssessment) => void;
  onDelete: (assessment: GradeAssessment) => void;
}) {
  const byId = new Map(module.assessments.map((a) => [a.id, a]));
  const fullYear = module.type === "FULL_YEAR";
  if (rows.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-500">No assessments yet. Add the first one to start tracking this {fullYear ? "semester" : "module"}.</p>;
  }
  return (
    <div role="table" aria-label={fullYear ? `${section.label} assessments` : "Assessments"} className="text-sm">
      <div role="rowgroup" className="hidden sm:block">
        <div role="row" className={`grid ${ROW_GRID} gap-3 px-5 py-2 text-xs font-medium text-slate-500 border-b border-slate-100`}>
          <span role="columnheader">Assessment</span>
          <span role="columnheader" className="text-right">{fullYear ? `Weight in ${section.label}` : "Weight"}</span>
          <span role="columnheader" className="text-right">Mark</span>
          <span role="columnheader" className="text-right">Contribution</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" className="sr-only">Actions</span>
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row) => {
          const assessment = byId.get(row.id)!;
          return (
            <div
              key={row.id}
              role="row"
              className={`grid grid-cols-2 ${ROW_GRID} gap-x-3 gap-y-1.5 items-start px-5 py-3 border-b border-slate-100 last:border-0 transition duration-150 hover:bg-slate-50`}
            >
              <div role="cell" className="col-span-2 sm:col-span-1 min-w-0">
                <p className="font-medium text-slate-800">{row.name}</p>
                <DateLine assessment={assessment} />
              </div>
              <div role="cell" className="sm:text-right tabular-nums text-slate-700">
                <MobileLabel>Weight</MobileLabel>
                {formatWeight(row.weight)}
                {fullYear && <p className="text-xs text-slate-500">{formatWeight(row.effectiveWeight)} of module</p>}
              </div>
              <div role="cell" className="sm:text-right tabular-nums text-slate-700">
                <MobileLabel>Mark</MobileLabel>
                <span>{formatMark(assessment)}</span>
              </div>
              <div role="cell" className="sm:text-right tabular-nums font-medium text-slate-800">
                <MobileLabel>Contribution</MobileLabel>
                {row.contribution === null ? "—" : formatPoints(row.contribution)}
              </div>
              <div role="cell">
                <AssessmentStatusBadge status={row.status} awaiting={awaitingMark(assessment)} />
              </div>
              <div role="cell" className="col-span-2 sm:col-span-1 flex justify-end gap-1">
                <button
                  onClick={() => onEdit(assessment)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                  aria-label={`Edit ${row.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(assessment)}
                  className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                  aria-label={`Delete ${row.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** My Grades (FEAT-009): one module — where it stands, its assessments, its target and what-if. */
export default function GradeModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const [module, setModule] = useState<GradeModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<AssessmentDialog>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    if (!moduleId) return;
    setError(null);
    try {
      setModule(await fetchGradeModule(moduleId));
    } catch (err) {
      setError(apiError(err, "Failed to load this module"));
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => (module ? computeModule(module, { target: module.targetMark }) : null), [module]);

  const backLink = (
    <Link to="/grades" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My Grades
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading module">
        {backLink}
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }
  if (error || !module || !summary) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorState message={error ?? "Module not found"} onRetry={load} />
      </div>
    );
  }

  const fullYear = module.type === "FULL_YEAR";
  const target = summary.target;

  const removeModule = async () => {
    const sure = await confirm({
      title: `Delete ${module.code}?`,
      message: "This will permanently delete this module and all of its assessments.",
      confirmLabel: "Delete module",
    });
    if (!sure) return;
    try {
      await deleteGradeModule(module.id);
      navigate("/grades");
    } catch (err) {
      setActionError(apiError(err, "Could not delete the module."));
    }
  };

  const removeAssessment = async (assessment: GradeAssessment) => {
    const sure = await confirm({
      title: `Delete "${assessment.name}"?`,
      message: "Its weight and mark will be removed from this module.",
      confirmLabel: "Delete assessment",
    });
    if (!sure) return;
    setActionError(null);
    try {
      await deleteAssessment(assessment.id);
      await load();
    } catch (err) {
      setActionError(apiError(err, "Could not delete the assessment."));
    }
  };

  const saveTarget = async (targetMark: number | null) => {
    setModule(await updateGradeModule(module.id, { targetMark }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              {module.code} <span className="font-normal text-slate-500">· {module.name}</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {moduleTypeLabel(module)} · {module.academicYear}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className={button("secondary")}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
            <button onClick={removeModule} className={`${button("secondary")} text-red-600 hover:text-red-700`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </button>
          </div>
        </div>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

      {/* Where this module stands, at a glance. */}
      <Card bodyClassName="p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Average on marked work"
            value={summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
            size="lg"
          />
          <Stat label="Secured" value={formatSecured(summary.securedPoints)} />
          {/* Weight is what the marks are worked out with; the counts show the progress behind it. */}
          <Stat
            label="Marked"
            value={formatPercent(summary.markedWeight)}
            hint={
              summary.assessments.total === 0
                ? "No assessments yet"
                : `${summary.assessments.marked} of ${summary.assessments.total} ${summary.assessments.total === 1 ? "assessment" : "assessments"}${summary.assessments.missed > 0 ? ` (${summary.assessments.missed} missed)` : ""}`
            }
          />
          <Stat
            label="Remaining"
            value={formatPercent(summary.remainingWeight)}
            hint={`${summary.assessments.remaining} ${summary.assessments.remaining === 1 ? "assessment" : "assessments"} to come`}
          />
        </div>
        <GradeBar summary={summary} target={module.targetMark} size="lg" labelled />
        {summary.complete ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Everything is marked. Your final mark is <strong>{formatPercent(summary.securedPoints)}</strong>.
          </p>
        ) : (
          target && target.value !== null && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <TargetStatusBadge status={target.status} />
              {target.required !== null ? (
                <span>Need <strong className="tabular-nums">{formatRequired(target.required)}</strong> on remaining work for {formatWeight(target.value)}</span>
              ) : target.status === "SECURED" ? (
                <span>Your {formatWeight(target.value)} target is secured</span>
              ) : (
                <span>Highest possible now: <span className="tabular-nums">{formatPercent(summary.highestPossible)}</span></span>
              )}
            </div>
          )
        )}
      </Card>

      {!summary.setup.valid && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-1" role="status">
          <p className="text-sm font-medium text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> This module isn't fully set up yet
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-700">
            {summary.setup.issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
          <p className="text-xs text-amber-700">"What do I need?" and "What if?" switch on once these are fixed.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-4">
          {summary.sections.map((section) => (
            <Card
              key={section.label}
              title={fullYear ? section.label : "Assessments"}
              description={
                fullYear ? (
                  <>
                    <span>counts {formatWeight(section.moduleWeight)} of the module</span>
                    {section.sectionMark !== null && (
                      <>
                        {" · "}
                        <span>Section mark {formatPercent(section.sectionMark)} · {formatPoints(section.securedPoints)} secured</span>
                      </>
                    )}
                  </>
                ) : undefined
              }
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <WeightTotal section={section} />
                  <button onClick={() => setDialog({ section: section.section ?? undefined })} className={button("ghost", "sm")}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add assessment
                  </button>
                </div>
              }
              bodyClassName=""
            >
              <AssessmentList
                module={module}
                section={section}
                rows={summary.rows.filter((row) => (fullYear ? row.section === section.section : true))}
                onEdit={(assessment) => setDialog({ assessment })}
                onDelete={removeAssessment}
              />
            </Card>
          ))}
          <CalculationExplainer summary={summary} />
        </div>

        <div className="space-y-4">
          <TargetPanel summary={summary} target={module.targetMark} onChange={saveTarget} />
          {/* Keyed on the module's data, so the what-if starts afresh when real marks change. */}
          <WhatIfPanel key={module.updatedAt + module.assessments.map((a) => a.updatedAt).join()} module={module} summary={summary} />
        </div>
      </div>

      <p className="text-xs text-slate-500">{UNOFFICIAL_NOTE}</p>

      {confirmDialog}
      <ModuleFormModal
        open={editing}
        onClose={() => setEditing(false)}
        module={module}
        defaultYear={module.academicYear}
        onSaved={(updated) => {
          setEditing(false);
          setModule(updated);
        }}
      />
      <AssessmentFormModal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        module={module}
        assessment={dialog?.assessment}
        defaultSection={dialog?.section}
        onSaved={() => {
          setDialog(null);
          load();
        }}
      />
    </div>
  );
}
