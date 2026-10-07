import { Link } from "react-router-dom";
import { Bell, CalendarCheck, ClipboardCheck, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import Card from "../Card";
import Skeleton from "../Skeleton";
import { countdownLabel, formatShortDay } from "../../lib/gradeDisplay";
import { NEXT_UP_DAYS, type NextUpItem, type NextUpKind } from "../../lib/today";

const KIND: Record<NextUpKind, { label: string; icon: LucideIcon; chip: string }> = {
  TEST: { label: "Test", icon: ClipboardCheck, chip: "bg-amber-50 border-amber-200 text-amber-700" },
  DUE: { label: "Due", icon: FileText, chip: "bg-blue-50 border-blue-200 text-blue-700" },
  ENTRY_DUE: { label: "Logbook", icon: FolderOpen, chip: "bg-slate-100 border-slate-200 text-slate-600" },
  REMINDER: { label: "Reminder", icon: Bell, chip: "bg-slate-100 border-slate-200 text-slate-600" },
};

/** One list of what's coming, soonest first: tests, due dates, logbook deadlines and reminders. */
export default function NextUp({ items, loading }: { items: NextUpItem[]; loading: boolean }) {
  return (
    <Card title="Next up" description={`The next ${NEXT_UP_DAYS} days`} icon={CalendarCheck} bodyClassName="">
      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Nothing dated in the next {NEXT_UP_DAYS} days. A good time to get ahead.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const kind = KIND[item.kind];
            const Icon = kind.icon;
            return (
              <li key={item.id}>
                <Link to={item.href} className="flex items-center gap-3 px-5 py-3 transition duration-150 hover:bg-slate-50">
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                    {item.context && <span className="block truncate text-xs text-slate-500">{item.context}</span>}
                  </span>
                  <span className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${kind.chip}`}>{kind.label}</span>
                  <span className="w-24 shrink-0 text-right">
                    <span className={`block text-sm tabular-nums ${item.days <= 1 ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {countdownLabel(item.days)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      <span className="sm:hidden">{kind.label} · </span>
                      {formatShortDay(item.day)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
