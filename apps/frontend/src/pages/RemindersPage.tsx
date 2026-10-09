import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, Bell, BellRing, CalendarClock, Check, CheckCircle2,
  GraduationCap, Hourglass, NotebookPen, Plus, RotateCcw, Trash2, X,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import StatusChip from "../components/StatusChip";
import { button, inputClass } from "../lib/ui";
import {
  createReminder,
  deleteReminder,
  fetchAllEntries,
  fetchProjects,
  fetchReminderSettings,
  fetchReminders,
  updateReminder,
  updateReminderSettings,
  type Entry,
  type Reminder,
  type ReminderSettings,
} from "../api";
import { isOfflineId } from "../lib/offlineProjects";
import { useConfirm } from "../lib/useConfirm";

type Tab = "due" | "upcoming" | "history";

/**
 * What made each reminder, in words: the student, or which of their rules.
 * Rule names match the Rules section below, so "why am I seeing this?" has
 * an answer on the page. Only an overdue entry is shown in red.
 */
const SOURCE_META: Record<Reminder["source"], { label: string; icon: typeof Bell; rule: string | null; danger?: boolean }> = {
  MANUAL: { label: "Reminder", icon: Bell, rule: null },
  DUE_SOON: { label: "Due soon", icon: CalendarClock, rule: "Upcoming due dates" },
  OVERDUE: { label: "Overdue", icon: AlertTriangle, rule: "Overdue entries", danger: true },
  STALE: { label: "No progress", icon: Hourglass, rule: "Stalled entries" },
  DAILY_LOG: { label: "Daily log", icon: NotebookPen, rule: "Daily logbook reminder" },
  ASSESSMENT: { label: "Assessment", icon: GraduationCap, rule: "Upcoming tests & assessments" },
};

/** A Date as the value a datetime-local input expects, in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function entrySummary(entry: Entry): string {
  const text = Object.values(entry.values ?? {}).find((v) => typeof v === "string" && v.trim());
  return text ? String(text).trim() : "Untitled entry";
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Upcoming reminders by how soon they come: later today, within a week, then later. */
function groupByWhen(items: Reminder[]): { label: string; items: Reminder[] }[] {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const endOfWeek = endOfToday + 6 * 86_400_000;
  const groups = [
    { label: "Later today", items: [] as Reminder[] },
    { label: "This week", items: [] as Reminder[] },
    { label: "Later", items: [] as Reminder[] },
  ];
  for (const r of items) {
    const at = Date.parse(r.remindAt);
    groups[at < endOfToday ? 0 : at < endOfWeek ? 1 : 2].items.push(r);
  }
  return groups.filter((g) => g.items.length > 0);
}

// ── Reminder row ──────────────────────────────────────────────────────────

function ReminderCard({
  reminder,
  onUpdate,
  onDelete,
}: {
  reminder: Reminder;
  onUpdate: (id: string, data: Parameters<typeof updateReminder>[1]) => void;
  onDelete: (id: string) => void;
}) {
  const meta = SOURCE_META[reminder.source];
  const Icon = meta.icon;
  const isPending = reminder.status === "PENDING";
  const isDue = isPending && new Date(reminder.remindAt) <= new Date();
  const danger = isPending && meta.danger;

  return (
    <li className="px-4 py-4 sm:px-5" data-testid="reminder">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          {/* What kind of reminder, and why it exists — secondary to the title. */}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${danger ? "text-red-600" : "text-slate-400"}`} aria-hidden="true" />
            <span className={danger ? "font-semibold text-red-700" : "font-medium text-slate-600"}>{meta.label}</span>
            <span aria-hidden="true">·</span>
            <span>{meta.rule ? <>from your “{meta.rule}” rule</> : "set by you"}</span>
          </p>

          <p className={`mt-1 text-sm font-semibold break-words ${isPending ? "text-slate-900" : "text-slate-600"}`}>
            {reminder.title}
          </p>
          {reminder.note && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{reminder.note}</p>}

          <p className="mt-1 text-xs text-slate-500">
            {isPending ? (
              <span className="tabular-nums">{`${isDue ? "Since" : "At"} ${formatWhen(reminder.remindAt)}`}</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {reminder.status === "COMPLETED" ? (
                  <StatusChip tone="success" icon={CheckCircle2}>Completed</StatusChip>
                ) : (
                  <StatusChip tone="neutral" icon={X}>Dismissed</StatusChip>
                )}
                <span className="tabular-nums">{formatWhen(reminder.completedAt ?? reminder.dismissedAt ?? reminder.remindAt)}</span>
              </span>
            )}
            {reminder.entry && (
              <>
                {" · "}
                <Link to={`/projects/${reminder.entry.projectId}`} className="font-medium text-blue-600 hover:underline">
                  {reminder.entry.projectName}
                </Link>
                {reminder.entry.dueDate && ` · due ${new Date(reminder.entry.dueDate.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
              </>
            )}
            {reminder.assessment && (
              <>
                {" · "}
                <Link to={`/grades/${reminder.assessment.moduleId}`} className="font-medium text-blue-600 hover:underline">
                  {reminder.assessment.moduleCode}
                </Link>
                {reminder.assessment.date &&
                  ` · ${reminder.assessment.dateKind === "TEST" ? "test" : "due"} ${new Date(reminder.assessment.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {isPending ? (
            <>
              <button onClick={() => onUpdate(reminder.id, { status: "COMPLETED" })} className={button(isDue ? "primary" : "secondary", "sm")}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Complete
              </button>
              <button
                onClick={() => onUpdate(reminder.id, { remindAt: new Date(Date.now() + 86_400_000).toISOString() })}
                className={button("secondary", "sm")}
                title="Remind me again in a day"
              >
                <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" /> Snooze 1 day
              </button>
              <button onClick={() => onUpdate(reminder.id, { status: "DISMISSED" })} className={button("ghost", "sm")}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Dismiss
              </button>
            </>
          ) : (
            <button onClick={() => onUpdate(reminder.id, { status: "PENDING" })} className={button("ghost", "sm")}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reopen
            </button>
          )}
          {reminder.source === "MANUAL" && (
            <button
              onClick={() => onDelete(reminder.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete reminder"
              title="Delete reminder"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── New reminder form ─────────────────────────────────────────────────────

function NewReminderForm({ onCreated, onCancel }: { onCreated: (r: Reminder) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [remindAt, setRemindAt] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const [entryId, setEntryId] = useState("");
  const [entries, setEntries] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Linking is optional, so a failure here just leaves the list empty.
    Promise.all([fetchProjects(), fetchAllEntries({ limit: 200 })])
      .then(([projects, listing]) => {
        const names = Object.fromEntries(projects.map((p) => [p.id, p.name]));
        setEntries(
          listing.entries
            .filter((e) => e.status === "OPEN" && !isOfflineId(e.id))
            .map((e) => ({ id: e.id, label: `${names[e.projectId] ?? "Project"} — ${entrySummary(e)}` }))
        );
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the reminder a title.");
    if (!remindAt || isNaN(Date.parse(remindAt))) return setError("Choose when to be reminded.");
    setSaving(true);
    setError(null);
    try {
      const created = await createReminder({
        title: title.trim(),
        note: note.trim() || null,
        remindAt: new Date(remindAt).toISOString(),
        entryId: entryId || null,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err, "Could not save the reminder."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h2 className="text-[15px] font-semibold text-slate-900">New reminder</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Title</span>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="e.g. Email my supervisor" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Remind me at</span>
          <input type="datetime-local" className={inputClass} value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Linked entry (optional)</span>
        <select className={inputClass} value={entryId} onChange={(e) => setEntryId(e.target.value)}>
          <option value="">None</option>
          {entries.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Note (optional)</span>
        <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={button("ghost")}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={button("primary")}>
          {saving ? "Saving..." : "Save reminder"}
        </button>
      </div>
    </form>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────

/** One rule: its name and what it does on the left; its setting and switch on the right. */
function RuleRow({ label, description, checked, onChange, children }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** The rule's own setting, shown only while the rule is on. */
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        {checked && children}
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-blue-600" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${checked ? "translate-x-5" : ""}`} />
          </button>
          {/* The state in words too, not only the switch's position and colour. */}
          <span className="w-6 text-xs font-medium text-slate-500" aria-hidden="true">{checked ? "On" : "Off"}</span>
        </span>
      </div>
    </li>
  );
}

const settingLabel = "flex items-center gap-2 text-xs text-slate-600";
const numberCls =
  "h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm tabular-nums text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

function ReminderRules({ onSaved }: { onSaved: () => void }) {
  const [rules, setRules] = useState<ReminderSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  useEffect(() => {
    fetchReminderSettings().then(setRules).catch(() => setMessage({ text: "Could not load your reminder rules.", failed: true }));
  }, []);

  if (!rules) {
    return message ? <p role="alert" className="py-4 text-sm text-red-700">{message.text}</p> : <LoadingState message="Loading rules..." />;
  }

  const set = (patch: Partial<ReminderSettings>) => {
    setRules({ ...rules, ...patch });
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Days are counted on this device's calendar.
      setRules(await updateReminderSettings({ ...rules, timeZone: browserTimeZone() }));
      setMessage({ text: "Rules saved.", failed: false });
      onSaved();
    } catch (err) {
      setMessage({ text: errorMessage(err, "Could not save your rules."), failed: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ul className="divide-y divide-slate-100">
        <RuleRow
          label="Upcoming due dates"
          description="Remind me before an open entry is due."
          checked={rules.dueSoonEnabled}
          onChange={(v) => set({ dueSoonEnabled: v })}
        >
          <label className={settingLabel}>
            Days before
            <input
              type="number" min={0} max={30} className={numberCls} aria-label="Days before due date"
              value={rules.dueSoonDays}
              onChange={(e) => set({ dueSoonDays: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
            />
          </label>
        </RuleRow>
        <RuleRow
          label="Overdue entries"
          description="Remind me when an open entry passes its due date."
          checked={rules.overdueEnabled}
          onChange={(v) => set({ overdueEnabled: v })}
        />
        <RuleRow
          label="Stalled entries"
          description="Remind me about open entries I haven't touched in a while."
          checked={rules.staleEnabled}
          onChange={(v) => set({ staleEnabled: v })}
        >
          <label className={settingLabel}>
            After
            <input
              type="number" min={1} max={365} className={numberCls} aria-label="Days without progress"
              value={rules.staleDays}
              onChange={(e) => set({ staleDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
            />
            days
          </label>
        </RuleRow>
        <RuleRow
          label="Upcoming tests & assessments"
          description="Remind me 5 days and 2 days before a dated assessment in My Grades."
          checked={rules.assessmentEnabled}
          onChange={(v) => set({ assessmentEnabled: v })}
        />
        <RuleRow
          label="Daily logbook reminder"
          description="Remind me if I haven't logged anything by a set time."
          checked={rules.dailyLogEnabled}
          onChange={(v) => set({ dailyLogEnabled: v })}
        >
          <label className={settingLabel}>
            At
            <input
              type="time"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Daily reminder time"
              value={rules.dailyLogTime}
              onChange={(e) => e.target.value && set({ dailyLogTime: e.target.value })}
            />
          </label>
        </RuleRow>
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        {message && (
          <span role={message.failed ? "alert" : "status"} className={`text-xs ${message.failed ? "text-red-700" : "text-slate-500"}`}>
            {message.text}
          </span>
        )}
        <button onClick={save} disabled={saving} className={button("primary", "sm")}>
          {saving ? "Saving..." : "Save rules"}
        </button>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

const TAB_ORDER: Tab[] = ["due", "upcoming", "history"];

export default function RemindersPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [pending, setPending] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("due");
  // The dashboard's "New reminder" arrives with ?new=1 and opens the form straight away.
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(() => searchParams.get("new") === "1");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, h] = await Promise.all([fetchReminders("pending"), fetchReminders("done")]);
      setPending(p);
      setHistory(h);
    } catch (err) {
      setError(errorMessage(err, "Failed to load reminders"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { due, upcoming } = useMemo(() => {
    const now = Date.now();
    return {
      due: pending.filter((r) => Date.parse(r.remindAt) <= now),
      upcoming: pending.filter((r) => Date.parse(r.remindAt) > now),
    };
  }, [pending]);

  const handleUpdate = async (id: string, data: Parameters<typeof updateReminder>[1]) => {
    setActionError(null);
    try {
      const updated = await updateReminder(id, data);
      if (updated.status === "PENDING") {
        setHistory((h) => h.filter((r) => r.id !== id));
        setPending((p) =>
          [...p.filter((r) => r.id !== id), updated].sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt)));
      } else {
        setPending((p) => p.filter((r) => r.id !== id));
        setHistory((h) => [updated, ...h.filter((r) => r.id !== id)]);
      }
    } catch (err) {
      setActionError(errorMessage(err, "Could not update the reminder."));
    }
  };

  const handleDelete = async (id: string) => {
    const sure = await confirm({
      title: "Delete this reminder?",
      message: "It will be removed for good.",
      confirmLabel: "Delete reminder",
    });
    if (!sure) return;
    setActionError(null);
    try {
      await deleteReminder(id);
      setPending((p) => p.filter((r) => r.id !== id));
      setHistory((h) => h.filter((r) => r.id !== id));
    } catch (err) {
      setActionError(errorMessage(err, "Could not delete the reminder."));
    }
  };

  // "Needs attention" is exactly what "Due now" was: pending reminders whose time has come.
  const tabs: { key: Tab; label: string; items: Reminder[] }[] = [
    { key: "due", label: "Needs attention", items: due },
    { key: "upcoming", label: "Upcoming", items: upcoming },
    { key: "history", label: "Done & dismissed", items: history },
  ];
  const current = tabs.find((t) => t.key === tab)!;

  const emptyCopy: Record<Tab, { title: string; description: string }> = {
    due: { title: "Nothing needs your attention", description: "You're all caught up. Reminders appear here once their time comes or one of your rules is triggered." },
    upcoming: { title: "No upcoming reminders", description: "Reminders you set for later wait here until their time." },
    history: { title: "No completed or dismissed reminders yet.", description: "Reminders you complete or dismiss are kept here." },
  };

  // Arrow keys move between tabs, as a tab list should.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TAB_ORDER.indexOf(tab);
    const next = e.key === "ArrowRight" ? TAB_ORDER[(i + 1) % 3] : e.key === "ArrowLeft" ? TAB_ORDER[(i + 2) % 3] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`reminders-tab-${next}`)?.focus();
  };

  const list = (items: Reminder[]) => (
    <ul className="divide-y divide-slate-100">
      {items.map((r) => (
        <ReminderCard key={r.id} reminder={r} onUpdate={handleUpdate} onDelete={handleDelete} />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {confirmDialog}
      <PageHeader
        title="Reminders"
        subtitle="Nudges you asked for, plus the ones your rules create."
        action={
          <button onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className={button("primary")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New reminder
          </button>
        }
      />

      {showForm && (
        <NewReminderForm
          onCancel={() => setShowForm(false)}
          onCreated={(r) => {
            setShowForm(false);
            setPending((p) => [...p, r].sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt)));
            setTab(Date.parse(r.remindAt) <= Date.now() ? "due" : "upcoming");
          }}
        />
      )}

      {/* ── Your reminders ─────────────────────────────────────────────── */}
      <section aria-label="Your reminders" className="rounded-xl border border-slate-200 bg-white">
        <div role="tablist" aria-label="Reminder views" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 sm:px-4">
          {tabs.map((t) => {
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                id={`reminders-tab-${t.key}`}
                role="tab"
                aria-selected={selected}
                aria-controls="reminders-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3 text-sm font-medium transition-colors duration-150 ${
                  selected ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                {!loading && (
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div id="reminders-panel" role="tabpanel" aria-labelledby={`reminders-tab-${tab}`}>
          {actionError && (
            <p role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5">{actionError}</p>
          )}

          {loading ? (
            <div className="divide-y divide-slate-100" aria-busy="true">
              <span className="sr-only" role="status">Loading reminders...</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-5 py-4 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : current.items.length === 0 ? (
            <EmptyState
              compact
              icon={tab === "history" ? CheckCircle2 : tab === "due" ? BellRing : CalendarClock}
              {...emptyCopy[tab]}
            />
          ) : tab === "upcoming" ? (
            // Grouped by how soon, so the nearest things are read first.
            <div>
              {groupByWhen(current.items).map((group) => (
                <div key={group.label}>
                  <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-5">
                    {group.label}
                  </h3>
                  {list(group.items)}
                </div>
              ))}
            </div>
          ) : tab === "history" ? (
            // History is quieter than what's still active.
            <div className="rounded-b-xl bg-slate-50">{list(current.items)}</div>
          ) : (
            list(current.items)
          )}
        </div>
      </section>

      {/* ── Rules: why automatic reminders appear ──────────────────────── */}
      <section aria-labelledby="reminder-rules-heading" className="rounded-xl border border-slate-200 bg-white px-5 pt-4 pb-4">
        <h2 id="reminder-rules-heading" className="text-[15px] font-semibold text-slate-900">Rules</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          These create reminders for you automatically. They never create one twice for the same thing.
        </p>
        <div className="mt-2">
          <ReminderRules onSaved={load} />
        </div>
      </section>
    </div>
  );
}
