import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import { computeModule, formatPercent, formatSecured, formatWeight } from "../../lib/grades";
import { moduleTypeLabel } from "../../lib/gradeDisplay";
import { Badge, TargetStatusBadge } from "./GradeBadges";

/** One module on the overview, with its figures from the grade engine. */
export default function ModuleCard({ module }: { module: GradeModule }) {
  const summary = computeModule(module, { target: module.targetMark });
  const marked = Math.min(100, Math.max(0, summary.markedWeight));

  return (
    <Link
      to={`/grades/${module.id}`}
      className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-200 transition"
      aria-label={`${module.code} ${module.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{module.code}</p>
          <p className="text-xs text-slate-500 truncate">{module.name}</p>
        </div>
        <Badge tone="slate">{moduleTypeLabel(module)}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <dt className="text-[11px] text-slate-500">Secured</dt>
          <dd className="text-lg font-bold text-slate-900">{formatSecured(summary.securedPoints)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">Average on marked work</dt>
          <dd className="text-lg font-bold text-slate-900">
            {summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-slate-500 mb-1">
          <span>Marked {formatPercent(summary.markedWeight)}</span>
          <span>Remaining {formatPercent(summary.remainingWeight)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${marked}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {!summary.setup.valid ? (
          <Badge tone="amber" title={summary.setup.issues.join(" ")}>
            <AlertTriangle className="h-3 w-3" /> Finish setting up
          </Badge>
        ) : summary.target ? (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            {module.targetMark !== null && <span>Target {formatWeight(module.targetMark)}</span>}
            <TargetStatusBadge status={summary.target.status} />
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
      </div>
    </Link>
  );
}
