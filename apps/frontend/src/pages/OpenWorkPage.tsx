import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Inbox, Plus } from "lucide-react";
import { api } from "../api/client";
import { updateEntry } from "../api";
import { useToast } from "../components/ToastContext";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Skeleton from "../components/Skeleton";
import { button } from "../lib/ui";
import { daysUntil } from "../lib/gradeDisplay";
import { localDateKey } from "../lib/utils";
import type { Entry } from "@logbook/shared";

/** How far ahead "Coming up" plans; anything later is listed under it, quietly. */
const COMING_UP_DAYS = 14;
/** What the "Due this week" count covers, today included. */
const WEEK_DAYS = 6;
/** Undated items shown before "Show the other …". */
const BACKLOG_PREVIEW = 5;
/** Open items asked for per request; the rest arrive a page at a time. */
const PAGE_SIZE = 100;

type OpenEntry = Entry & { projectName?: string };

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

/** The due day as the entry form wrote it, "YYYY-MM-DD", free of time-zone drift. */
const dueDay = (entry: Entry) => entry.dueDate!.slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00`);

function formatLongDay(day: string): string {
  return asDate(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

function lateBy(days: number): string {
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function OpenWorkPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<OpenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Entries just marked done, fading out before they leave the list.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  // The one entry whose due date is being set, and the date being typed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [showWholeBacklog, setShowWholeBacklog] = useState(false);
  // The server pages this list, so it says whether another page exists and
  // from where the next one starts.
  const [truncated, setTruncated] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pages are ordered by due date, most urgent first, so a truncated list
  // loses the items with the least claim on the reader's attention.
  const page = (offset: number) => api.get(`/me/open-entries?limit=${PAGE_SIZE}&offset=${offset}`);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await page(0);
      setEntries(res.data.entries);
      setTruncated(res.data.truncated);
      setNextOffset(res.data.offset + res.data.entries.length);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to load open work");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await page(nextOffset);
      // An entry finished in another tab shifts the page boundaries; never
      // show the same item twice for it.
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.data.entries.filter((e: OpenEntry) => !seen.has(e.id))];
      });
      setTruncated(res.data.truncated);
      setNextOffset(res.data.offset + res.data.entries.length);
    } catch {
      toast.error("Couldn't load more open work. Try again.");
    } finally {
      setLoadingMore(false);
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

  const startEditing = (entry: Entry) => {
    setEditingId(entry.id);
    setDraftDate(entry.dueDate ? dueDay(entry) : localDateKey(new Date()));
  };

  /** The same update the entry form makes, with only the due date in it. */
  const saveDueDate = async (id: string) => {
    if (!draftDate) return;
    setSavingDate(true);
    try {
      const updated = await updateEntry(id, { dueDate: draftDate });
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, dueDate: updated?.dueDate ?? `${draftDate}T00:00:00.000Z` } : e))
      );
      setEditingId(null);
    } catch {
      toast.error("Couldn't change that date. Try again.");
    } finally {
      setSavingDate(false);
    }
  };

  const header = (
    <PageHeader title="Open Work" subtitle="Everything unfinished, across every project. This page is the one that owns it." />
  );

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl" aria-busy="true">
        <span className="sr-only" role="status">Loading open work…</span>
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6 max-w-4xl">
        {header}
        <Card><ErrorState message={error} onRetry={load} /></Card>
      </div>
    );
  }

  // ── Sort the work by when it's due ──────────────────────────────────────
  const today = localDateKey(new Date());
  const overdue: OpenEntry[] = [];
  const comingUp: OpenEntry[] = [];
  const later: OpenEntry[] = [];
  const noDate: OpenEntry[] = [];
  for (const entry of entries) {
    if (!entry.dueDate) noDate.push(entry);
    else {
      const days = daysUntil(dueDay(entry), today);
      if (days < 0) overdue.push(entry);
      else if (days <= COMING_UP_DAYS) comingUp.push(entry);
      else later.push(entry);
    }
  }
  const byDue = (a: Entry, b: Entry) => dueDay(a).localeCompare(dueDay(b));
  overdue.sort(byDue);
  comingUp.sort(byDue);
  later.sort(byDue);
  const dueThisWeek = comingUp.filter((e) => daysUntil(dueDay(e), today) <= WEEK_DAYS).length;

  // Consecutive items on the same day share one date label.
  const groupByDay = (list: OpenEntry[]) => {
    const groups: { day: string; items: OpenEntry[] }[] = [];
    for (const entry of list) {
      const last = groups[groups.length - 1];
      if (last && last.day === dueDay(entry)) last.items.push(entry);
      else groups.push({ day: dueDay(entry), items: [entry] });
    }
    return groups;
  };

  const backlogShown = showWholeBacklog ? noDate : noDate.slice(0, BACKLOG_PREVIEW);

  // ── Pieces shared by every row ──────────────────────────────────────────
  const title = (entry: OpenEntry) => (
    <Link
      to={`/projects/${entry.projectId}?entry=${entry.id}`}
      className="block text-sm font-semibold text-slate-900 break-words hover:text-blue-700"
    >
      {getEntrySummary(entry)}
    </Link>
  );
  const projectLink = (entry: OpenEntry) => (
    <Link to={`/projects/${entry.projectId}`} className="font-medium text-slate-600 hover:text-blue-700 hover:underline">
      {entry.projectName ?? "Project"}
    </Link>
  );

  const dateEditor = (entry: OpenEntry) => (
    <DueDateEditor
      label={`${entry.dueDate ? "New due date" : "Due date"} for ${getEntrySummary(entry)}`}
      value={draftDate}
      onChange={setDraftDate}
      saving={savingDate}
      onSave={() => saveDueDate(entry.id)}
      onCancel={() => setEditingId(null)}
    />
  );

  const actions = (entry: OpenEntry) => {
    const calendarUrl = buildGoogleCalendarUrl(entry, entry.projectName ?? "Project");
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => markDone(entry.id)}
          disabled={leaving.has(entry.id)}
          className={`${button("secondary", "sm")} hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Mark done
        </button>
        <button
          onClick={() => startEditing(entry)}
          aria-expanded={editingId === entry.id}
          aria-label={`Move date for ${getEntrySummary(entry)}`}
          className={button("ghost", "sm")}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Move date
        </button>
        {calendarUrl && (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Add to Google Calendar"
            title="Add to Google Calendar"
            className={`${button("ghost", "sm")} w-8 px-0`}
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    );
  };

  const rowMotion = (id: string) => (leaving.has(id) ? "leave-done" : "transition duration-150");

  return (
    <div className="space-y-6 max-w-4xl">
      {header}

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="No open work"
            description="Everything is caught up. Entries you haven't marked done will gather here, sorted by when they're due."
            action={<Link to="/entries" className={button("secondary", "sm")}>View entries</Link>}
          />
        </Card>
      ) : (
        <>
          {/* ── Where things stand: three counts that jump to their section ── */}
          <nav aria-label="Open work summary" className="flex flex-wrap gap-2">
            <SummaryLink href="#overdue" count={overdue.length} label="Overdue" danger={overdue.length > 0}
              icon={overdue.length > 0 ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} />
            <SummaryLink href="#coming-up" count={dueThisWeek} label="Due this week"
              icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />} />
            <SummaryLink href="#no-date" count={noDate.length} label="No date"
              icon={<Inbox className="h-4 w-4" aria-hidden="true" />} />
          </nav>

          {truncated && (
            <p className="text-xs text-slate-500">
              Showing the {entries.length} most urgent items. The counts above cover those.
            </p>
          )}

          {/* ── Overdue: noticeable, not alarming ───────────────────────── */}
          {overdue.length > 0 && (
            <Section
              id="overdue"
              heading={
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                  Overdue <span className="font-normal text-slate-500">· {overdue.length}</span>
                </span>
              }
              description="Past their due date. Finish them, or give them a date you can keep."
              className="border-red-200"
            >
              <ul className="divide-y divide-slate-100">
                {overdue.map((entry) => {
                  const late = -daysUntil(dueDay(entry), today);
                  return (
                    <li key={entry.id} className={`px-5 py-4 ${rowMotion(entry.id)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          {title(entry)}
                          <p className="mt-0.5 text-xs text-slate-500">{projectLink(entry)}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Was due {formatLongDay(dueDay(entry))}
                            <span className="font-medium text-red-700"> · {lateBy(late)}</span>
                          </p>
                        </div>
                        <div className="shrink-0">{actions(entry)}</div>
                      </div>
                      {editingId === entry.id && dateEditor(entry)}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* ── Coming up: the plan ─────────────────────────────────────── */}
          <Section id="coming-up" heading="Coming up" description="The next two weeks.">
            {comingUp.length === 0 && later.length === 0 ? (
              <div className="px-5 py-5">
                <p className="text-sm font-medium text-slate-800">Nothing scheduled yet</p>
                <p className="text-sm text-slate-500">
                  {noDate.length > 0 ? "Your undated work is below." : "Nothing is due in the next two weeks."}
                </p>
              </div>
            ) : (
              <>
                {comingUp.length === 0 && (
                  <p className="px-5 pt-4 text-sm text-slate-500">Nothing is due in the next two weeks.</p>
                )}
                <DatedList groups={groupByDay(comingUp)} today={today} render={(entry) => (
                  <div className={rowMotion(entry.id)}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        {title(entry)}
                        <p className="mt-0.5 text-xs text-slate-500">{projectLink(entry)}</p>
                      </div>
                      <div className="shrink-0">{actions(entry)}</div>
                    </div>
                    {editingId === entry.id && dateEditor(entry)}
                  </div>
                )} />
                {later.length > 0 && (
                  <>
                    <h3 className="border-t border-slate-100 px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Later
                    </h3>
                    <DatedList groups={groupByDay(later)} today={today} render={(entry) => (
                      <div className={rowMotion(entry.id)}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            {title(entry)}
                            <p className="mt-0.5 text-xs text-slate-500">{projectLink(entry)}</p>
                          </div>
                          <div className="shrink-0">{actions(entry)}</div>
                        </div>
                        {editingId === entry.id && dateEditor(entry)}
                      </div>
                    )} />
                  </>
                )}
              </>
            )}
          </Section>

          {/* ── No date yet: the backlog, quieter ──────────────────────── */}
          {noDate.length > 0 && (
            <Section
              id="no-date"
              heading={<>No date yet <span className="font-normal text-slate-500">· {noDate.length}</span></>}
              description="Giving something a date is what moves it into the plan above."
              quiet
            >
              <ul className="divide-y divide-slate-100">
                {backlogShown.map((entry) => (
                  <li key={entry.id} className={`px-5 py-3.5 ${rowMotion(entry.id)}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        {title(entry)}
                        <p className="mt-0.5 text-xs text-slate-500">
                          {projectLink(entry)}
                          {" · opened "}
                          <span>
                            {new Date(entry.entryDate ?? entry.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {editingId !== entry.id && (
                          <button
                            onClick={() => startEditing(entry)}
                            aria-label={`Add a due date to ${getEntrySummary(entry)}`}
                            className={`${button("ghost", "sm")} border border-dashed border-slate-300 text-slate-600 hover:border-slate-400`}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Add a due date
                          </button>
                        )}
                        <button
                          onClick={() => markDone(entry.id)}
                          disabled={leaving.has(entry.id)}
                          className={`${button("ghost", "sm")} hover:bg-emerald-50 hover:text-emerald-700`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Mark done
                        </button>
                      </div>
                    </div>
                    {editingId === entry.id && dateEditor(entry)}
                  </li>
                ))}
              </ul>
              {noDate.length > BACKLOG_PREVIEW && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <button
                    onClick={() => setShowWholeBacklog((v) => !v)}
                    aria-expanded={showWholeBacklog}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showWholeBacklog ? "Show fewer" : `Show the other ${noDate.length - BACKLOG_PREVIEW}`}
                  </button>
                </div>
              )}
            </Section>
          )}

          {truncated && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className={button("secondary", "sm")}
              >
                {loadingMore ? "Loading more…" : "Load more open work"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Small layout pieces ───────────────────────────────────────────────────

function Section({
  id,
  heading,
  description,
  className = "",
  quiet = false,
  children,
}: {
  id: string;
  heading: ReactNode;
  description: string;
  className?: string;
  /** The backlog: a softer surface than dated work. */
  quiet?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-6 rounded-xl border ${quiet ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"} ${className}`}
    >
      <div className="border-b border-slate-100 px-5 pt-4 pb-3">
        <h2 id={headingId} className="text-[15px] font-semibold text-slate-900">{heading}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryLink({ href, count, label, icon, danger = false }: {
  href: string;
  count: number;
  label: string;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition-colors duration-150 hover:border-slate-300 ${
        danger ? "border-red-200 text-red-700" : "border-slate-200 text-slate-600"
      }`}
    >
      <span className={danger ? "" : "text-slate-400"}>{icon}</span>
      <span className="font-semibold tabular-nums text-slate-900">{count}</span>
      {label}
    </a>
  );
}

/** Dated work as a two-column plan: the day on the left, what's due on it on the right. */
function DatedList({ groups, today, render }: {
  groups: { day: string; items: OpenEntry[] }[];
  today: string;
  render: (entry: OpenEntry) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {groups.map(({ day, items }) => {
        const days = daysUntil(day, today);
        const soon = days <= 1;
        const date = asDate(day);
        return (
          <li key={day} className="grid gap-2 px-5 py-4 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
            <p className={`text-sm ${soon ? "font-semibold text-blue-700" : "font-medium text-slate-700"}`}>
              <span className="sm:block">
                {days === 0 ? "Today" : days === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "long" })}
              </span>{" "}
              <span className={`text-xs font-normal sm:block ${soon ? "text-blue-700/80" : "text-slate-500"}`}>
                {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            </p>
            <ul className="space-y-3">
              {items.map((entry) => <li key={entry.id}>{render(entry)}</li>)}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function DueDateEditor({ label, value, onChange, saving, onSave, onCancel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        autoFocus
        required
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      />
      <button type="submit" disabled={saving || !value} className={button("primary", "sm")}>
        {saving ? "Saving…" : "Save date"}
      </button>
      <button type="button" onClick={onCancel} className={button("ghost", "sm")}>
        Cancel
      </button>
    </form>
  );
}
