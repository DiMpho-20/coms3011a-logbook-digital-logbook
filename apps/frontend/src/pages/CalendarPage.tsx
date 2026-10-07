import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useNarrowScreen } from "../lib/useNarrowScreen";
import { api } from "../api/client";
import Modal from "../components/Modal";
import GoogleCalendarSync from "../components/GoogleCalendarSync";
import { entryDateKey, fieldValueText, formatDuration } from "../lib/utils";

type Entry = {
  id: string;
  projectId: string;
  entryDate: string | null;
  dueDate?: string | null;
  createdAt: string;
  durationMinutes: number;
  status?: "OPEN" | "DONE";
  values: Record<string, unknown>;
  format?: { fields: { id: string; type: string }[] } | null;
};

type Project = { id: string; name: string; status?: string };

/**
 * What an entry is about: its first TEXT field, read with the format it was
 * saved in (as on the Entries page). Older entries without one have none.
 */
function describe(e: Entry): string {
  const field = e.format?.fields?.find((f) => f.type === "TEXT");
  return field ? fieldValueText(e.values[field.id]) : "";
}

/** A day key as a local date, so "2026-10-15" is the 15th in every time zone. */
function dayFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  // Phones get an agenda list: a seven-column grid leaves each day too narrow to read.
  const narrow = useNarrowScreen();
  const [openDay, setOpenDay] = useState<string | null>(null);

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    api.get("/projects").then((res) => {
      // Active projects first; an archived one is still there to look back on.
      const all = res.data as Project[];
      const sorted = [...all.filter((p) => p.status !== "ARCHIVED"), ...all.filter((p) => p.status === "ARCHIVED")];
      setProjects(sorted);
      if (!params.get("project") && sorted.length > 0) {
        setParams((prev) => {
          prev.set("project", sorted[0].id);
          return prev;
        }, { replace: true });
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingEntries(true);
    setLoadError(false);
    api.get(`/projects/${selectedProjectId}/entries`)
      .then((res) => setEntries(res.data))
      .catch(() => {
        setEntries([]);
        setLoadError(true);
      })
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

  // Work still to do, on the day it is due (the same dates Google sync sends).
  const dueByDate = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const e of entries) {
      if (!e.dueDate || e.status === "DONE") continue;
      const key = e.dueDate.slice(0, 10);
      (map[key] ??= []).push(e);
    }
    return map;
  }, [entries]);

  const todayKey = ymd(new Date());

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const openDayEntries = openDay ? entriesByDate[openDay] ?? [] : [];
  const openDayDue = openDay ? dueByDate[openDay] ?? [] : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Calendar" subtitle="What's coming, and what you logged, for one project at a time." />

      {loadingProjects ? (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only" role="status">Loading projects…</span>
          <Skeleton className="h-9 w-64" />
          <div className="rounded-xl border border-slate-200 bg-white p-5"><Skeleton className="h-64 w-full" /></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={CalendarDays}
            title="No projects yet."
            description="Create a project and give its entries due dates to see them on the calendar."
          />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="calendar-project" className="block text-xs font-medium text-slate-500 mb-1">Project</label>
            <select
              id="calendar-project"
              value={selectedProjectId}
              onChange={(e) => setParams({ project: e.target.value })}
              className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.status === "ARCHIVED" ? `${p.name} (archived)` : p.name}</option>
              ))}
            </select>
          </div>

          {loadError && (
            <p role="alert" className="text-sm text-red-600">Couldn't load this project's entries. Check your connection and try again.</p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">{monthLabel}</span>
                {loadingEntries && <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />}
                <button
                  onClick={() => setCursor(new Date())}
                  className="text-xs text-blue-700 hover:underline font-medium"
                >
                  Today
                </button>
              </div>
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {narrow ? (
              <ul className="divide-y divide-slate-100" aria-label={`${monthLabel} agenda`}>
                {grid
                  .filter((day) => day.getMonth() === cursor.getMonth())
                  .map((day) => ymd(day))
                  .filter((key) => (entriesByDate[key]?.length ?? 0) + (dueByDate[key]?.length ?? 0) > 0)
                  .map((key) => {
                    const day = dayFromKey(key);
                    const due = dueByDate[key] ?? [];
                    const logged = entriesByDate[key] ?? [];
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setOpenDay(key)}
                          className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <span className="w-10 shrink-0 text-center">
                            <span className="block text-xs text-slate-500">
                              {day.toLocaleDateString(undefined, { weekday: "short" })}
                            </span>
                            <span className={`block text-lg font-semibold tabular-nums ${key === todayKey ? "text-blue-600" : "text-slate-800"}`}>
                              {day.getDate()}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 space-y-1">
                            {due.map((e) => (
                              <span key={e.id} className={`block truncate text-sm ${key < todayKey ? "text-amber-800" : "text-blue-700"}`}>
                                {key < todayKey ? "Overdue" : "Due"}: {describe(e) || formatDuration(e.durationMinutes)}
                              </span>
                            ))}
                            {logged.length > 0 && (
                              <span className="block text-sm text-slate-600">
                                {logged.length} {logged.length === 1 ? "entry" : "entries"} logged
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <>
            <div className="grid grid-cols-7 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                const dayDue = dueByDate[key] ?? [];
                const hasEntries = dayEntries.length + dayDue.length > 0;
                // Two chips fit a cell; due work first, since it needs doing.
                const dueShown = dayDue.slice(0, 2);
                const entriesShown = dayEntries.slice(0, 2 - dueShown.length);
                const hidden = dayDue.length + dayEntries.length - dueShown.length - entriesShown.length;
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
                        className={`text-xs font-medium tabular-nums ${
                          hasEntries ? "cursor-pointer hover:underline" : "cursor-default"
                        } ${
                          isToday
                            ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                            : inMonth
                            ? "text-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                      {dayEntries.length > 0 && (
                        <span className="text-[11px] font-medium tabular-nums text-slate-500" title="Entries on this day">
                          {dayEntries.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dueShown.map((e) => (
                        <button
                          key={`due-${e.id}`}
                          onClick={() => setOpenDay(key)}
                          className={`block w-full text-left truncate text-xs leading-snug rounded px-1.5 py-0.5 transition ${
                            key < todayKey ? "bg-amber-50 text-amber-800 hover:bg-amber-100" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                          }`}
                        >
                          {key < todayKey ? "Overdue" : "Due"}: {describe(e) || formatDuration(e.durationMinutes)}
                        </button>
                      ))}
                      {entriesShown.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setOpenDay(key)}
                          className="block w-full text-left truncate text-xs leading-snug rounded px-1.5 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                        >
                          {describe(e) || `${e.durationMinutes}m`}
                        </button>
                      ))}
                      {hidden > 0 && (
                        <button
                          onClick={() => setOpenDay(key)}
                          className="block w-full text-left text-xs font-medium text-blue-700 hover:underline px-1.5"
                        >
                          +{hidden} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
              </>
            )}
          </div>
        </>
      )}

      <GoogleCalendarSync />

      <Modal
        open={!!openDay}
        onClose={() => setOpenDay(null)}
        title={
          openDay
            ? dayFromKey(openDay).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""
        }
      >
        {openDayDue.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              {openDay && openDay < todayKey ? "Overdue" : "Due"}
            </p>
            <ul className="space-y-2">
              {openDayDue.map((e) => (
                <DayItem key={`due-${e.id}`} entry={e} onOpen={() => setOpenDay(null)} />
              ))}
            </ul>
          </div>
        )}
        {openDayEntries.length > 0 && (
          <>
            {openDayDue.length > 0 && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Logged</p>
            )}
            <ul className="space-y-2">
              {openDayEntries.map((e) => (
                <DayItem key={e.id} entry={e} onOpen={() => setOpenDay(null)} />
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  );
}

function DayItem({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const description = describe(entry);
  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2">
      {description && <p className="text-sm text-slate-800 mb-1">{description}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {entry.durationMinutes} min{entry.status === "DONE" ? " · Done" : ""}
        </span>
        <Link
          to={`/projects/${entry.projectId}`}
          className="text-xs text-blue-700 hover:underline font-medium"
          onClick={onOpen}
        >
          Open project
        </Link>
      </div>
    </li>
  );
}
