import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Inbox, type LucideIcon } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../components/ToastContext";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Skeleton from "../components/Skeleton";
import { button } from "../lib/ui";
import type { Entry } from "@logbook/shared";

type Bucket = "overdue" | "today" | "soon" | "noDueDate";

function getEntrySummary(entry: Entry): string {
  const textValue = Object.entries(entry.values ?? {}).find(([, value]) => typeof value === "string" && value.trim());
  return textValue ? String(textValue[1]).trim() : `Logbook entry ${entry.id}`;
}

function buildGoogleCalendarUrl(entry: Entry, projectName: string): string | null {
  if (!entry.dueDate) return null;

  const start = new Date(entry.dueDate);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const formatDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${projectName} — ${getEntrySummary(entry)}`,
    details: `Open work item from the Digital Logbook.\nProject: ${projectName}`,
    location: "",
    dates: `${formatDate(start)}/${formatDate(end)}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function bucketFor(entry: Entry): Bucket {
  if (!entry.dueDate) return "noDueDate";

  const due = new Date(entry.dueDate);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < startOfToday) return "overdue";
  if (dueDay.getTime() === startOfToday.getTime()) return "today";
  return "soon";
}

export default function OpenWorkPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Entries just marked done, fading out before they leave the list.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/me/open-entries");
      setEntries(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to load open work");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markDone = async (id: string) => {
    try {
      await api.patch(`/entries/${id}/status`, { status: "DONE" });
      setLeaving((prev) => new Set(prev).add(id));
      // Long enough for the fade; instant when the viewer asks for less motion.
      window.setTimeout(() => {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 180);
    } catch {
      toast.error("Couldn't mark that entry as done. Try again.");
    }
  };

  const grouped: Record<Bucket, Entry[]> = {
    overdue: [],
    today: [],
    soon: [],
    noDueDate: [],
  };
  for (const entry of entries) grouped[bucketFor(entry)].push(entry);

  // Overdue is worth noticing, not alarming: amber, never red.
  const sections: { key: Bucket; label: string; icon: LucideIcon; description: string }[] = [
    { key: "overdue", label: "Overdue", icon: AlertTriangle, description: "Past their due date" },
    { key: "today", label: "Due Today", icon: CalendarClock, description: "Due before the day ends" },
    { key: "soon", label: "Upcoming", icon: CalendarClock, description: "Due later" },
    { key: "noDueDate", label: "No Due Date", icon: Inbox, description: "Open, with no date set" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl" aria-busy="true">
        <span className="sr-only" role="status">Loading open work…</span>
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Open Work"
        subtitle={
          <>
            What's unfinished, sorted by when it's due. <span className="font-medium text-slate-700">({entries.length} open)</span>
          </>
        }
      />

      {entries.length === 0 && (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="You're all caught up."
            description="Entries you haven't marked done yet will gather here, grouped by when they're due."
          />
        </Card>
      )}

      {sections.map(({ key, label, icon, description }) =>
        grouped[key].length === 0 ? null : (
          <Card
            key={key}
            title={`${label} (${grouped[key].length})`}
            description={description}
            icon={icon}
            className={key === "overdue" ? "border-amber-200" : ""}
            bodyClassName=""
          >
            <ul className="divide-y divide-slate-100">
              {grouped[key].map((entry) => {
                const projectName = (entry as any).projectName ?? "Project";
                const calendarUrl = entry.dueDate ? buildGoogleCalendarUrl(entry, projectName) : null;
                return (
                  <li
                    key={entry.id}
                    className={`flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between ${
                      leaving.has(entry.id) ? "leave-done" : "transition duration-150"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{getEntrySummary(entry)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <Link to={`/projects/${entry.projectId}`} className="font-medium text-slate-700 hover:text-blue-700 hover:underline">
                          {projectName}
                        </Link>
                        {" · "}
                        <span>
                          {entry.entryDate
                            ? new Date(entry.entryDate).toLocaleDateString()
                            : new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                        {entry.dueDate && <span>{` · due ${new Date(entry.dueDate).toLocaleDateString()}`}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {calendarUrl && (
                        <a href={calendarUrl} target="_blank" rel="noreferrer" className={button("ghost", "sm")}>
                          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add to Google Calendar
                        </a>
                      )}
                      <button
                        onClick={() => markDone(entry.id)}
                        disabled={leaving.has(entry.id)}
                        className={`${button("secondary", "sm")} hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Mark done
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      )}
    </div>
  );
}
