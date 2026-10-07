import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import GradeBar from "../grades/GradeBar";
import Skeleton from "../Skeleton";
import Eyebrow from "./Eyebrow";
import { TargetStatusBadge } from "../grades/GradeBadges";
import { formatPercent, formatSecured, formatWeight, type ModuleSummary } from "../../lib/grades";

const linkClass = "inline-flex items-center gap-1 rounded text-xs font-medium text-blue-600 transition-colors duration-150 hover:text-blue-700";

/**
 * This year's modules, where each one stands, without opening My Grades.
 * Every figure is the grade engine's summary, only formatted here.
 */
export default function ModulesAtAGlance({
  modules,
  summaries,
  loading = false,
  failed = false,
}: {
  modules: GradeModule[];
  summaries: Map<string, ModuleSummary>;
  loading?: boolean;
  /** The module list couldn't be loaded (and there was no cached copy). */
  failed?: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId}><Eyebrow>Modules at a glance</Eyebrow></h2>
        <Link to="/grades" className={linkClass}>
          My Grades <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
          Your modules couldn't be loaded just now. They'll show here once the connection is back.
        </p>
      ) : modules.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-sm font-medium text-slate-800">No modules added yet.</p>
          <p className="mt-0.5 text-sm text-slate-500">Add your modules to see where you stand in each one.</p>
          <Link to="/grades" className={`${linkClass} mt-2`}>
            Add a module <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const summary = summaries.get(module.id)!;
            const showStatus = summary.target && summary.target.status !== "NO_TARGET" && summary.setup.valid;
            return (
              <li key={module.id}>
                <Link
                  to={`/grades/${module.id}`}
                  className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-slate-300"
                >
                  <span className="block text-sm font-semibold text-slate-900">{module.code}</span>
                  <span className="mb-3 block truncate text-xs text-slate-500">{module.name}</span>
                  <GradeBar summary={summary} target={module.targetMark} />
                  <dl className="mt-3 space-y-0.5 text-xs tabular-nums text-slate-600">
                    <div>
                      <dt className="sr-only">Average so far</dt>
                      <dd>
                        <span className="text-sm font-semibold text-slate-900">
                          {summary.averageSoFar === null ? "—" : formatPercent(summary.averageSoFar)}
                        </span>{" "}
                        average
                      </dd>
                    </div>
                    <div>
                      <dt className="sr-only">Secured</dt>
                      <dd>{formatSecured(summary.securedPoints)} secured</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Still to be marked</dt>
                      <dd>{formatWeight(summary.remainingWeight)} remaining</dd>
                    </div>
                  </dl>
                  <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                    {showStatus ? <TargetStatusBadge status={summary.target!.status} /> : <span />}
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                      View module
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
