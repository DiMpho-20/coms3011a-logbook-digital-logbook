import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Hourglass, Pencil, Plus, ShieldCheck, Trash2, TrendingUp } from "lucide-react";
import type { AssessmentSection, GradeAssessment } from "@logbook/shared";
import StatCard from "../components/StatCard";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import ModuleFormModal from "../components/grades/ModuleFormModal";
import AssessmentFormModal from "../components/grades/AssessmentFormModal";
import TargetPanel from "../components/grades/TargetPanel";
import WhatIfPanel from "../components/grades/WhatIfPanel";
import CalculationExplainer from "../components/grades/CalculationExplainer";
import { AssessmentStatusBadge, Badge } from "../components/grades/GradeBadges";
import { deleteAssessment, deleteGradeModule, fetchGradeModule, updateGradeModule, type GradeModule } from "../api";
import { useConfirm } from "../lib/useConfirm";
import {
  assessmentStatus,
  computeModule,
  formatMark,
  formatPercent,
  formatPoints,
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

function WeightTotal({ section }: { section: SectionSummary }) {
  if (section.assessmentCount === 0) return <Badge tone="slate">No assessments yet</Badge>;
  if (section.weightsComplete) {
    return (
      <Badge tone="emerald">
        <CheckCircle2 className="h-3 w-3" /> Weights total {formatWeight(section.weightTotal)}
      </Badge>
    );
  }
  const gap = section.unassignedWeight;
  return (
    <Badge tone="amber">
      <AlertTriangle className="h-3 w-3" /> Weights total {formatWeight(section.weightTotal)} ·{" "}
      {formatWeight(Math.abs(gap))} {gap > 0 ? "unassigned" : "too much"}
    </Badge>
  );
}

function DateLine({ assessment }: { assessment: GradeAssessment }) {
  if (!assessment.date) return null;
  const days = daysUntil(assessment.date);
  const pending = assessmentStatus(assessment) === "PENDING";
  return (
    <p className="text-[11px] text-slate-500">
      {DATE_KIND_LABEL[assessment.dateKind ?? "DUE"]} {formatDay(assessment.date)}
      {pending && days >= 0 && <span className="text-blue-600"> · {countdownLabel(days)}</span>}
    </p>
  );
}

function AssessmentTable({
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
    return <p className="px-4 py-3 text-sm text-slate-500">No assessments yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-500 border-b border-slate-100">
            <th className="text-left font-medium px-4 py-2">Assessment</th>
            <th className="text-right font-medium px-2 py-2">{fullYear ? `Weight in ${section.label}` : "Weight"}</th>
            <th className="text-right font-medium px-2 py-2">Mark</th>
            <th className="text-right font-medium px-2 py-2">Contribution</th>
            <th className="text-left font-medium px-2 py-2">Status</th>
            <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const assessment = byId.get(row.id)!;
            return (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-800">{row.name}</p>
                  <DateLine assessment={assessment} />
                </td>
                <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">
                  {formatWeight(row.weight)}
                  {fullYear && <p className="text-[11px] text-slate-400">{formatWeight(row.effectiveWeight)} of module</p>}
                </td>
                <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">{formatMark(assessment)}</td>
                <td className="px-2 py-2 text-right font-medium text-slate-800 whitespace-nowrap">
                  {row.contribution === null ? "—" : formatPoints(row.contribution)}
                </td>
                <td className="px-2 py-2">
                  <AssessmentStatusBadge status={row.status} awaiting={awaitingMark(assessment)} />
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(assessment)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label={`Edit ${row.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onDelete(assessment)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={`Delete ${row.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** My Grades (FEAT-009): one module — its marks, target, what-if and working. */
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

  if (loading) return <LoadingState message="Loading module..." />;
  if (error || !module || !summary) {
    return (
      <div className="space-y-4">
        <Link to="/grades" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My Grades
        </Link>
        <ErrorState message={error ?? "Module not found"} onRetry={load} />
      </div>
    );
  }

  const fullYear = module.type === "FULL_YEAR";

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
      <div className="space-y-2">
        <Link to="/grades" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> My Grades
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {module.code} <span className="font-normal text-slate-500">· {module.name}</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {moduleTypeLabel(module)} · {module.academicYear}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button onClick={removeModule} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 transition">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      {actionError && <p className="text-xs text-red-600">{actionError}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ShieldCheck} label="Secured" value={formatSecured(summary.securedPoints)} color="blue" />
        <StatCard
          icon={TrendingUp}
          label="Average on marked work"
          value={summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
          color="emerald"
        />
        <StatCard icon={CheckCircle2} label="Marked" value={formatPercent(summary.markedWeight)} color="purple" />
        <StatCard icon={Hourglass} label="Remaining" value={formatPercent(summary.remainingWeight)} color="slate" />
      </div>

      {summary.complete && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Everything is marked. Your final mark is <strong>{formatPercent(summary.securedPoints)}</strong>.
        </div>
      )}

      {!summary.setup.valid && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1" role="status">
          <p className="text-sm font-medium text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> This module isn't fully set up yet
          </p>
          <ul className="list-disc pl-5 text-xs text-amber-700">
            {summary.setup.issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
          <p className="text-[11px] text-amber-700">"What do I need?" and "What if?" switch on once these are fixed.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-4">
          {summary.sections.map((section) => (
            <section key={section.label} className="bg-white rounded-lg border border-slate-200" aria-label={fullYear ? section.label : "Assessments"}>
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{fullYear ? section.label : "Assessments"}</h2>
                {fullYear && <span className="text-xs text-slate-500">counts {formatWeight(section.moduleWeight)} of the module</span>}
                <WeightTotal section={section} />
                {fullYear && section.sectionMark !== null && (
                  <span className="text-xs text-slate-500">
                    Section mark {formatPercent(section.sectionMark)} · {formatPoints(section.securedPoints)} secured
                  </span>
                )}
                <button
                  onClick={() => setDialog({ section: section.section ?? undefined })}
                  className="ml-auto flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add assessment
                </button>
              </div>
              <AssessmentTable
                module={module}
                section={section}
                rows={summary.rows.filter((row) => (fullYear ? row.section === section.section : true))}
                onEdit={(assessment) => setDialog({ assessment })}
                onDelete={removeAssessment}
              />
            </section>
          ))}
          <CalculationExplainer summary={summary} />
        </div>

        <div className="space-y-4">
          <TargetPanel summary={summary} target={module.targetMark} onChange={saveTarget} />
          {/* Keyed on the module's data, so the what-if starts afresh when real marks change. */}
          <WhatIfPanel key={module.updatedAt + module.assessments.map((a) => a.updatedAt).join()} module={module} summary={summary} />
        </div>
      </div>

      <p className="text-[11px] text-slate-400">{UNOFFICIAL_NOTE}</p>

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
