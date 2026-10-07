import { Link } from "react-router-dom";
import { ArrowRight, Bell, BellPlus, ClipboardCheck, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import Card from "../Card";
import Skeleton from "../Skeleton";
import Eyebrow from "./Eyebrow";
import { countdownLabel, formatShortDay } from "../../lib/gradeDisplay";
import { NEXT_UP_DAYS, type NextUpItem, type NextUpKind } from "../../lib/today";

const KIND: Record<NextUpKind, { label: string; icon: LucideIcon }> = {
  TEST: { label: "Test", icon: ClipboardCheck },
  DUE: { label: "Due", icon: FileText },
  ENTRY_DUE: { label: "Logbook", icon: FolderOpen },
  REMINDER: { label: "Reminder", icon: Bell },
};

/** "Today", "Tomorrow", a weekday within the week, then a short date. */
function dayHeading(item: NextUpItem): string {
  if (item.days <= 1) return countdownLabel(item.days);
  if (item.days < 7) return new Date(`${item.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  return formatShortDay(item.day);
}

/** Items are already soonest first, so consecutive items with the same day form a group. */
function groupByDay(items: NextUpItem[]): { day: string; heading: string; items: NextUpItem[] }[] {
  const groups: { day: string; heading: string; items: NextUpItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else groups.push({ day: item.day, heading: dayHeading(item), items: [item] });
  }
  return groups;
}

const footerLink = "inline-flex items-center gap-1 rounded text-xs font-medium text-blue-600 transition-colors duration-150 hover:text-blue-700";

/** What's happening soon: tests, due dates, logbook deadlines and reminders, grouped by day. */
export default function NextUp({
  items,
  loading,
  remindersFailed = false,
}: {
  items: NextUpItem[];
  loading: boolean;
  /** Reminders couldn't be loaded, so the list may be missing some. */
  remindersFailed?: boolean;
}) {
  return (
    <Card title={<Eyebrow>Next up</Eyebrow>} description="What's happening soon" className="h-full flex flex-col" bodyClassName="flex-1 flex flex-col">
      {loading ? (
        <div className="space-y-3 p-5" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Nothing dated in the next {NEXT_UP_DAYS} days. A good time to get ahead.</p>
      ) : (
        <div className="py-2">
          {groupByDay(items).map((group) => (
            <div key={group.day} className="px-5 py-1.5">
              <h3 className="py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.heading}
              </h3>
              <ul>
                {group.items.map((item) => {
                  const kind = KIND[item.kind];
                  const Icon = kind.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-slate-50"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {kind.label}
                            {item.context && <> · {item.context}</>}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {/* The group heading says the day; each link still says it for screen readers. */}
                          <span className={item.days > 1 ? "" : "sr-only"}>{countdownLabel(item.days)}</span>
                          <span className="sr-only">, {formatShortDay(item.day)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {!loading && remindersFailed && (
        <p className="px-5 pb-2 text-xs text-slate-500">Your reminders couldn't be loaded just now, so some may be missing.</p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        <Link to="/reminders?new=1" className={footerLink}>
          <BellPlus className="h-3.5 w-3.5" aria-hidden="true" /> New reminder
        </Link>
        <Link to="/calendar" className={footerLink}>
          View all upcoming <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
