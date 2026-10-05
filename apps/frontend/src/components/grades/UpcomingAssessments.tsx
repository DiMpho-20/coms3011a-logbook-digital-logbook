import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { DATE_KIND_LABEL, countdownLabel, formatDay, type UpcomingAssessment } from "../../lib/gradeDisplay";

/** Dated, unmarked assessments in the next two weeks, soonest first. */
export default function UpcomingAssessments({ items }: { items: UpcomingAssessment[] }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200" aria-labelledby="upcoming-heading">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-slate-400" />
        <h2 id="upcoming-heading" className="text-sm font-semibold text-slate-900">Upcoming</h2>
        <span className="text-xs text-slate-400">next 14 days</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Nothing dated in the next 14 days.</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto p-3">
          {items.map(({ module, assessment, days }) => (
            <li key={assessment.id} className="shrink-0">
              <Link
                to={`/grades/${module.id}`}
                className={`block rounded-lg border px-3 py-2 min-w-[11rem] transition hover:bg-slate-50 ${
                  days <= 2 ? "border-amber-200 bg-amber-50" : "border-slate-200"
                }`}
              >
                <p className={`text-xs font-semibold ${days <= 2 ? "text-amber-700" : "text-blue-700"}`}>
                  {countdownLabel(days)} · {DATE_KIND_LABEL[assessment.dateKind ?? "DUE"]}
                </p>
                <p className="text-sm font-medium text-slate-800 truncate">{assessment.name}</p>
                <p className="text-[11px] text-slate-500">
                  {module.code} · {formatDay(assessment.date!)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
