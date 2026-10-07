import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import { formatPercent, formatRequired, formatSecured, formatWeight, type ModuleSummary } from "../../lib/grades";
import { moduleTypeLabel } from "../../lib/gradeDisplay";
import StatusChip from "../StatusChip";
import GradeBar from "./GradeBar";
import { TargetStatusBadge } from "./GradeBadges";

/**
 * One module on the overview: where it stands, and what the rest has to do.
 * The summary is the grade engine's own result, worked out once by the page;
 * this card only arranges and words it. Upcoming dates live in the page's
 * "Next assessment" section rather than repeating on every card.
 */
export default function ModuleCard({ module, summary }: { module: GradeModule; summary: ModuleSummary }) {
  const target = summary.target;
  const remaining = formatPercent(summary.remainingWeight);

  return (
    <Link
      to={`/grades/${module.id}`}
      aria-label={`${module.code} ${module.name}`}
      className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-slate-900">{module.code}</p>
          <p className="text-sm text-slate-500">
            <span className="break-words">{module.name}</span> · <span>{moduleTypeLabel(module)}</span>
          </p>
        </div>
        <div className="shrink-0">
          {!summary.setup.valid ? (
            <StatusChip tone="caution" icon={AlertTriangle} title={summary.setup.issues.join(" ")}>
              Finish setting up
            </StatusChip>
          ) : (
            target && <TargetStatusBadge status={target.status} />
          )}
        </div>
      </div>

      {!summary.setup.valid ? (
        // The engine can't place this module until its weights add up, so no
        // figure is shown that would be worked out on the wrong weights.
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">Not enough information yet</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Add or complete the assessment weights to see where you stand and what you need.
          </p>
          {summary.setup.issues.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {summary.setup.issues.slice(0, 2).map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* Two different numbers, kept apart: how the marked work went, and what's banked toward the final mark. */}
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-slate-500">
                {summary.averageSoFar === null ? "nothing marked yet" : "average on marked work"}
              </dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                {summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
              </dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-slate-500">secured toward the final mark</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{formatSecured(summary.securedPoints)}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <p className="text-xs tabular-nums text-slate-600">
              <span className="font-semibold text-slate-800">{formatPercent(summary.markedWeight)}</span> marked ·{" "}
              <span className="font-semibold text-slate-800">{remaining}</span> remaining
            </p>
            <GradeBar summary={summary} target={module.targetMark} labelled />
          </div>

          {target && (
            <p className="border-t border-slate-100 pt-3 text-sm text-slate-700">
              {target.value === null ? (
                <span className="text-slate-500">No target set. Open the module to choose one.</span>
              ) : target.required !== null ? (
                <>
                  You need <strong className="tabular-nums">{formatRequired(target.required)}</strong> on the remaining{" "}
                  {remaining} to reach {formatWeight(target.value)}.
                </>
              ) : target.status === "SECURED" ? (
                <>Your {formatWeight(target.value)} target is secured.</>
              ) : summary.complete ? (
                <>
                  Everything is marked: <span className="tabular-nums">{formatSecured(summary.securedPoints)}</span> against a{" "}
                  {formatWeight(target.value)} target.
                </>
              ) : (
                <>
                  Even full marks on what's left would give{" "}
                  <span className="tabular-nums">{formatPercent(summary.highestPossible)}</span>, below your{" "}
                  {formatWeight(target.value)} target.
                </>
              )}
            </p>
          )}
        </>
      )}

      <span className="mt-auto inline-flex items-center gap-1 self-end text-xs font-medium text-blue-600 group-hover:text-blue-700">
        Open module
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
