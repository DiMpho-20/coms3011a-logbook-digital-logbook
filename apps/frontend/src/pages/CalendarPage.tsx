import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../api/client";
import Modal from "../components/Modal";
import { entryDateKey } from "../lib/utils";

type Entry = {
  id: string;
  projectId: string;
  entryDate: string | null;
  createdAt: string;
  durationMinutes: number;
  values: Record<string, any>;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildGrid(monthStart: Date): Date[] {
  const start = new Date(monthStart);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [openDay, setOpenDay] = useState<string | null>(null);

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    api.get("/projects").then((res) => {
      setProjects(res.data);
      if (!params.get("project") && res.data.length > 0) {
        setParams({ project: res.data[0].id });
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingEntries(true);
    api.get(`/projects/${selectedProjectId}/entries`)
      .then((res) => setEntries(res.data))
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selectedProjectId]);

  const grid = useMemo(() => buildGrid(startOfMonth(cursor)), [cursor]);
  const entriesByDate = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const e of entries) {
      const key = entryDateKey(e);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [entries]);

  const todayKey = ymd(new Date());

  if (loadingProjects) return <p className="text-sm text-slate-500">Loading projects…</p>;
  if (projects.length === 0) return <p className="text-sm text-slate-500">No projects yet.</p>;

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const openDayEntries = openDay ? entriesByDate[openDay] ?? [] : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-cyan-600" />
        <h1 className="text-xl font-semibold text-slate-900">Calendar</h1>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Project</label>
        <select
          value={selectedProjectId}
          onChange={(e) => setParams({ project: e.target.value })}
          className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">{monthLabel}</span>
            {loadingEntries && <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />}
            <button
              onClick={() => setCursor(new Date())}
              className="text-[11px] text-cyan-700 hover:underline font-medium"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-3 py-2 text-center border-b border-slate-100">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const key = ymd(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const dayEntries = entriesByDate[key] ?? [];
            const hasEntries = dayEntries.length > 0;
            return (
              <div
                key={key}
                className={`min-h-[90px] border-b border-r border-slate-100 p-1.5 ${
                  inMonth ? "bg-white" : "bg-slate-50/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => hasEntries && setOpenDay(key)}
                    disabled={!hasEntries}
                    className={`text-[11px] font-medium ${
                      hasEntries ? "cursor-pointer hover:underline" : "cursor-default"
                    } ${
                      isToday
                        ? "bg-cyan-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                        : inMonth
                        ? "text-slate-700"
                        : "text-slate-400"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                  {hasEntries && (
                    <span className="text-[9px] font-semibold text-slate-400">
                      {dayEntries.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayEntries.slice(0, 2).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setOpenDay(key)}
                      className="block w-full text-left truncate text-[10px] rounded px-1 py-0.5 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 transition"
                    >
                      {e.durationMinutes}m
                    </button>
                  ))}
                  {dayEntries.length > 2 && (
                    <button
                      onClick={() => setOpenDay(key)}
                      className="block w-full text-left text-[9px] text-cyan-700 hover:underline px-1"
                    >
                      +{dayEntries.length - 2} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!openDay}
        onClose={() => setOpenDay(null)}
        title={
          openDay
            ? new Date(openDay).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""
        }
      >
        <ul className="space-y-2">
          {openDayEntries.map((e) => (
            <li key={e.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{e.durationMinutes} min</span>
                <Link
                  to={`/projects/${e.projectId}`}
                  className="text-xs text-cyan-700 hover:underline font-medium"
                  onClick={() => setOpenDay(null)}
                >
                  Open project
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}