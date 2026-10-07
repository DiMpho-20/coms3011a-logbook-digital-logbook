import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import Card from "../Card";
import GradeBar from "../grades/GradeBar";
import { TargetStatusBadge } from "../grades/GradeBadges";
import { formatPercent, type ModuleSummary } from "../../lib/grades";

/**
 * A compact strip of this year's modules: where each stands, at a glance.
 * The detail lives in My Grades; each row is a link to it.
 */
export default function ModulesAtAGlance({
  modules,
  summaries,
}: {
  modules: GradeModule[];
  summaries: Map<string, ModuleSummary>;
}) {
  return (
    <Card
      title="Modules at a glance"
      icon={GraduationCap}
      action={<Link to="/grades" className="text-xs font-medium text-blue-600 hover:text-blue-700">My Grades</Link>}
      bodyClassName=""
    >
      {modules.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          Add your modules in <Link to="/grades" className="font-medium text-blue-600 hover:underline">My Grades</Link> to see where you stand.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 rounded-b-xl overflow-hidden">
          {modules.map((module) => {
            const summary = summaries.get(module.id)!;
            return (
              <li key={module.id} className="bg-white">
                <Link to={`/grades/${module.id}`} className="block px-5 py-3 transition duration-150 hover:bg-slate-50">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                      {module.code} <span className="font-normal text-slate-500">{module.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      {summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
                    </span>
                  </div>
                  <GradeBar summary={summary} target={module.targetMark} />
                  {summary.target && summary.target.status !== "NO_TARGET" && summary.setup.valid && (
                    <div className="mt-2"><TargetStatusBadge status={summary.target.status} /></div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
