import { Link } from "react-router-dom";
import { CalendarClock, ClipboardCheck, FileText } from "lucide-react";
import { DATE_KIND_LABEL, countdownLabel, formatDay, type UpcomingAssessment } from "../../lib/gradeDisplay";
import Card from "../Card";

/** Dated, unmarked assessments in the next two weeks, soonest first. */
export default function UpcomingAssessments({ items }: { items: UpcomingAssessment[] }) {
  return (
    <Card title="Upcoming" description="Dated assessments in the next 14 days" icon={CalendarClock} bodyClassName="">
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Nothing dated in the next 14 days.</p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto p-4 snap-x">
          {items.map(({ module, assessment, days }) => {
            const KindIcon = assessment.dateKind === "TEST" ? ClipboardCheck : FileText;
            const soon = days <= 2;
            return (
              <li key={assessment.id} className="shrink-0 snap-start">
                <Link
                  to={`/grades/${module.id}`}
                  className={`block min-w-[12rem] rounded-lg border px-3 py-2.5 transition duration-150 hover:border-slate-300 ${
                    soon ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className={`flex items-center gap-1.5 text-xs font-semibold ${soon ? "text-amber-700" : "text-blue-700"}`}>
                    <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {countdownLabel(days)} · {DATE_KIND_LABEL[assessment.dateKind ?? "DUE"]}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800 truncate">{assessment.name}</p>
                  <p className="text-xs text-slate-500">
                    {module.code} · {formatDay(assessment.date!)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
