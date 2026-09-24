import { useMemo } from "react";
import { Bell, AlertTriangle, Clock, CalendarCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Entry } from "../api";

interface DeadlineRemindersProps {
  entries: Entry[];
  projectNames: Record<string, string>;
}

interface ReminderItem {
  entry: Entry;
  daysUntil: number;
  label: string;
  urgency: "overdue" | "today" | "tomorrow" | "soon";
}

/**
 * Deadline reminders panel — shows upcoming and overdue entry deadlines.
 * Categorises into: overdue, due today, due tomorrow, due within 3 days.
 */
export default function DeadlineReminders({ entries, projectNames }: DeadlineRemindersProps) {
  const navigate = useNavigate();

  const reminders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result: ReminderItem[] = [];

    entries.forEach((entry) => {
      if (!entry.dueDate) return;
      const due = new Date(entry.dueDate.slice(0, 10) + "T00:00:00");
      const diffMs = due.getTime() - todayStart.getTime();
      const daysUntil = Math.round(diffMs / 86400000);

      if (daysUntil < 0) {
        result.push({ entry, daysUntil, label: `${Math.abs(daysUntil)}d overdue`, urgency: "overdue" });
      } else if (daysUntil === 0) {
        result.push({ entry, daysUntil, label: "Due today", urgency: "today" });
      } else if (daysUntil === 1) {
        result.push({ entry, daysUntil, label: "Due tomorrow", urgency: "tomorrow" });
      } else if (daysUntil <= 3) {
        result.push({ entry, daysUntil, label: `Due in ${daysUntil} days`, urgency: "soon" });
      }
    });

    // Sort: overdue first, then by daysUntil ascending
    result.sort((a, b) => a.daysUntil - b.daysUntil);
    return result;
  }, [entries]);

  if (reminders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Deadlines</h2>
        </div>
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 mb-2">
            <CalendarCheck className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-slate-700">All clear!</p>
          <p className="text-xs text-slate-400 mt-1">No upcoming deadlines in the next 3 days.</p>
        </div>
      </div>
    );
  }

  const urgencyStyles = {
    overdue: "bg-red-50 border-red-200 text-red-700",
    today: "bg-orange-50 border-orange-200 text-orange-700",
    tomorrow: "bg-amber-50 border-amber-200 text-amber-700",
    soon: "bg-blue-50 border-blue-200 text-blue-700",
  };

  const urgencyIcons = {
    overdue: AlertTriangle,
    today: AlertTriangle,
    tomorrow: Clock,
    soon: Bell,
  };

  const overdueCount = reminders.filter((r) => r.urgency === "overdue").length;

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Deadlines</h2>
        </div>
        {overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
            {overdueCount} overdue
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
        {reminders.map((r) => {
          const Icon = urgencyIcons[r.urgency];
          const style = urgencyStyles[r.urgency];

          // Try to get a description from first TEXT field value
          const description =
            Object.values(r.entry.values || {}).find((v) => typeof v === "string" && v.trim()) as string | undefined;

          return (
            <button
              key={r.entry.id}
              onClick={() => navigate(`/projects/${r.entry.projectId}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition text-left"
            >
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${style}`}>
                <Icon className="h-3 w-3" />
                {r.label}
              </span>
              <div className="flex-1 min-w-0">
                {description && (
                  <p className="text-sm text-slate-800 truncate">{String(description)}</p>
                )}
                <p className="text-[11px] text-slate-400">
                  {projectNames[r.entry.projectId] || "Unknown"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
