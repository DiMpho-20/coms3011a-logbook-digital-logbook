import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import { formatPercent, formatRequired, formatSecured, formatWeight, type ModuleSummary } from "../../lib/grades";
import { DATE_KIND_LABEL, countdownLabel, formatDay, moduleTypeLabel, nextAssessment } from "../../lib/gradeDisplay";
import StatusChip from "../StatusChip";
import GradeBar from "./GradeBar";
import { TargetStatusBadge } from "./GradeBadges";

/**
 * One module on the overview. The summary is the grade engine's own result,
 * worked out once by the page; this card only arranges it.
 */
export default function ModuleCard({ module, summary }: { module: GradeModule; summary: ModuleSummary }) {
  const next = nextAssessment(module);
  const target = summary.target;

  return (
    <Link
      to={`/grades/${module.id}`}
      aria-label={`${module.code} ${module.name}`}
      className="group flex flex-col gap-4 bg-white rounded-xl border border-slate-200 p-5 transition duration-150 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-slate-900">{module.code}</p>
          <p className="text-sm text-slate-500 truncate">{module.name}</p>
        </div>
        <StatusChip>{moduleTypeLabel(module)}</StatusChip>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
            {summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
          </p>
          <p className="text-xs text-slate-500">Average on marked work</p>
        </div>
        {!summary.setup.valid ? (
          <StatusChip tone="caution" icon={AlertTriangle} title={summary.setup.issues.join(" ")}>
            Finish setting up
          </StatusChip>
        ) : (
          target && target.status !== "NO_TARGET" && <TargetStatusBadge status={target.status} />
        )}
      </div>

      <GradeBar summary={summary} target={module.targetMark} />

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Secured</dt>
          <dd className="font-semibold tabular-nums text-slate-800">{formatSecured(summary.securedPoints)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Marked</dt>
          <dd className="font-semibold tabular-nums text-slate-800">{formatPercent(summary.markedWeight)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Remaining</dt>
          <dd className="font-semibold tabular-nums text-slate-800">{formatPercent(summary.remainingWeight)}</dd>
        </div>
      </dl>

      {target && target.value !== null && (
        <p className="text-sm text-slate-700">
          {target.required !== null ? (
            <>Need <strong className="tabular-nums">{formatRequired(target.required)}</strong> on remaining work for {formatWeight(target.value)}</>
          ) : target.status === "SECURED" ? (
            <>Your {formatWeight(target.value)} target is secured</>
          ) : (
            <>Highest possible now: <span className="tabular-nums">{formatPercent(summary.highestPossible)}</span></>
          )}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {next ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {DATE_KIND_LABEL[next.assessment.dateKind ?? "DUE"]} · {next.assessment.name} · {formatDay(next.assessment.date!)}
            </span>
            <span className="shrink-0 font-medium text-slate-700">{countdownLabel(next.days)}</span>
          </span>
        ) : (
          <span>No upcoming dates</span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
