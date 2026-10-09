import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarClock, ClipboardCheck, FileText } from "lucide-react";
import { DATE_KIND_LABEL, countdownLabel, formatShortDay, type UpcomingAssessment } from "../../lib/gradeDisplay";
import { formatWeight, type ModuleSummary } from "../../lib/grades";

const longDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/**
 * The one place on My Grades that says what's coming: the next dated,
 * unmarked assessment, then a few after it. The list is the existing
 * upcoming-assessments result; its weight is the engine's own effective
 * weight, shown only while the module's set-up is valid.
 */
export default function UpcomingAssessments({
  items,
  summaries,
  aside,
}: {
  items: UpcomingAssessment[];
  summaries: Map<string, ModuleSummary>;
  /** Quiet context beside it, such as how many modules and targets there are. */
  aside?: ReactNode;
}) {
  const headingId = useId();
  const [next, ...rest] = items;

  const worth = (item: UpcomingAssessment): string | null => {
    const summary = summaries.get(item.module.id);
    if (!summary?.setup.valid) return null;
    const row = summary.rows.find((r) => r.id === item.assessment.id);
    return row ? `Worth ${formatWeight(Math.round(row.effectiveWeight * 10) / 10)} of the module` : null;
  };

  return (
    <section aria-labelledby={headingId} className="grid grid-cols-1 rounded-xl border border-slate-200 bg-white lg:grid-cols-3">
      <div className="p-5 lg:col-span-2">
        <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next assessment</h2>

        {!next ? (
          <div className="mt-3 flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-slate-800">Nothing upcoming</p>
              <p className="text-sm text-slate-500">You have no dated assessments in the next 14 days.</p>
            </div>
          </div>
        ) : (
          <>
            <Link to={`/grades/${next.module.id}`} className="group mt-2 block rounded-lg">
              <p className="text-lg font-semibold text-slate-900 break-words group-hover:text-blue-700">{next.assessment.name}</p>
              <p className="text-sm text-slate-600">{`${next.module.code} · ${longDay(next.assessment.date!)}`}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-600">
                {next.assessment.dateKind === "TEST" ? (
                  <ClipboardCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                <span className="font-semibold text-slate-900">{countdownLabel(next.days)}</span>
                <span>· {DATE_KIND_LABEL[next.assessment.dateKind ?? "DUE"]}</span>
                {worth(next) && <span>· {worth(next)}</span>}
              </p>
            </Link>

            {rest.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-xs font-medium text-slate-500">Then</h3>
                <ul className="mt-1 divide-y divide-slate-100">
                  {rest.slice(0, 3).map(({ module, assessment, days }) => (
                    <li key={assessment.id}>
                      <Link
                        to={`/grades/${module.id}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm transition-colors duration-150 hover:text-blue-700"
                      >
                        <span className="min-w-0 text-slate-800">{`${module.code} · ${assessment.name}`}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {countdownLabel(days)} · {DATE_KIND_LABEL[assessment.dateKind ?? "DUE"]} · {formatShortDay(assessment.date!)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {rest.length > 3 && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {rest.length - 3} more in the next 14 days
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {aside && (
        <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">{aside}</div>
      )}
    </section>
  );
}
