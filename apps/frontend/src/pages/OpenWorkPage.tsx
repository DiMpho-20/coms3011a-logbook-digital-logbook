import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, Inbox } from "lucide-react";
import { api } from "../api/client";
import type { Entry } from "@logbook/shared";

type Bucket = "overdue" | "today" | "soon" | "noDueDate";

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      // Get all projects, then all open entries per project.
      const projectsRes = await api.get("/projects");
      const projects: { id: string; name: string }[] = projectsRes.data;

      const all: Entry[] = [];
      for (const project of projects) {
        const res = await api.get(`/projects/${project.id}/entries`, {
          params: { status: "OPEN" },
        });
        for (const entry of res.data as Entry[]) {
          (entry as any).projectName = project.name;
          all.push(entry);
        }
      }
      setEntries(all);
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
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert("Failed to mark entry as done");
    }
  };

  const grouped: Record<Bucket, Entry[]> = {
    overdue: [],
    today: [],
    soon: [],
    noDueDate: [],
  };
  for (const entry of entries) grouped[bucketFor(entry)].push(entry);

  const sections: { key: Bucket; label: string; icon: any; accent: string }[] = [
    { key: "overdue", label: "Overdue", icon: AlertTriangle, accent: "text-red-600" },
    { key: "today", label: "Due Today", icon: CalendarClock, accent: "text-amber-600" },
    { key: "soon", label: "Upcoming", icon: CalendarClock, accent: "text-slate-600" },
    { key: "noDueDate", label: "No Due Date", icon: Inbox, accent: "text-slate-500" },
  ];

  if (loading) return <p className="text-sm text-slate-500">Loading open work…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Circle className="h-5 w-5 text-cyan-600" />
        <h1 className="text-xl font-semibold text-slate-900">Open Work</h1>
        <span className="text-sm text-slate-500">({entries.length} open)</span>
      </div>

      {entries.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          You're all caught up.
        </div>
      )}

      {sections.map(({ key, label, icon: Icon, accent }) =>
        grouped[key].length === 0 ? null : (
          <section key={key} className="space-y-2">
            <h2 className={`flex items-center gap-2 text-sm font-semibold ${accent}`}>
              <Icon className="h-4 w-4" />
              {label} ({grouped[key].length})
            </h2>
            <ul className="space-y-2">
              {grouped[key].map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/projects/${entry.projectId}`}
                      className="text-sm font-medium text-slate-900 hover:text-cyan-700"
                    >
                      {(entry as any).projectName ?? "Project"}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {entry.entryDate
                        ? new Date(entry.entryDate).toLocaleDateString()
                        : new Date(entry.createdAt).toLocaleDateString()}
                      {entry.dueDate && ` · due ${new Date(entry.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => markDone(entry.id)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark done
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}