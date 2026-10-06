import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, Bell, BellRing, CalendarClock, Check, CheckCircle2,
  GraduationCap, Hourglass, NotebookPen, Plus, RotateCcw, Settings2, Trash2, X,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
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

const SOURCE_META: Record<Reminder["source"], { label: string; icon: typeof Bell; style: string }> = {
  MANUAL: { label: "Reminder", icon: Bell, style: "bg-blue-50 border-blue-200 text-blue-700" },
  DUE_SOON: { label: "Due soon", icon: CalendarClock, style: "bg-amber-50 border-amber-200 text-amber-700" },
  OVERDUE: { label: "Overdue", icon: AlertTriangle, style: "bg-red-50 border-red-200 text-red-700" },
  STALE: { label: "No progress", icon: Hourglass, style: "bg-violet-50 border-violet-200 text-violet-700" },
  DAILY_LOG: { label: "Daily log", icon: NotebookPen, style: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  ASSESSMENT: { label: "Assessment", icon: GraduationCap, style: "bg-cyan-50 border-cyan-300 text-cyan-700" },
};

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500";

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

// ── Reminder card ─────────────────────────────────────────────────────────

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

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-4 py-3" data-testid="reminder">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${meta.style}`}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
            {reminder.status !== "PENDING" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {reminder.status === "COMPLETED" ? "Completed" : "Dismissed"}
              </span>
            )}
          </div>
          <p className={`text-sm font-medium ${isPending ? "text-slate-900" : "text-slate-500 line-through"}`}>
            {reminder.title}
          </p>
          {reminder.note && <p className="text-xs text-slate-600 whitespace-pre-wrap">{reminder.note}</p>}
          <p className="text-[11px] text-slate-400">
            {isPending
              ? `${new Date(reminder.remindAt) <= new Date() ? "Since" : "At"} ${formatWhen(reminder.remindAt)}`
              : formatWhen(reminder.completedAt ?? reminder.dismissedAt ?? reminder.remindAt)}
            {reminder.entry && (
              <>
                {" · "}
                <Link to={`/projects/${reminder.entry.projectId}`} className="text-blue-600 hover:underline">
                  {reminder.entry.projectName}
                </Link>
                {reminder.entry.dueDate && ` · due ${new Date(reminder.entry.dueDate.slice(0, 10) + "T00:00:00").toLocaleDateString()}`}
              </>
            )}
            {reminder.assessment && (
              <>
                {" · "}
                <Link to={`/grades/${reminder.assessment.moduleId}`} className="text-blue-600 hover:underline">
                  {reminder.assessment.moduleCode}
                </Link>
                {reminder.assessment.date &&
                  ` · ${reminder.assessment.dateKind === "TEST" ? "test" : "due"} ${new Date(reminder.assessment.date + "T00:00:00").toLocaleDateString()}`}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isPending ? (
            <>
              <button
                onClick={() => onUpdate(reminder.id, { status: "COMPLETED" })}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition"
              >
                <Check className="h-3.5 w-3.5" /> Complete
              </button>
              <button
                onClick={() => onUpdate(reminder.id, { remindAt: new Date(Date.now() + 86_400_000).toISOString() })}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                title="Remind me again in a day"
              >
                <AlarmClock className="h-3.5 w-3.5" /> Snooze
              </button>
              <button
                onClick={() => onUpdate(reminder.id, { status: "DISMISSED" })}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <X className="h-3.5 w-3.5" /> Dismiss
              </button>
            </>
          ) : (
            <button
              onClick={() => onUpdate(reminder.id, { status: "PENDING" })}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </button>
          )}
          {reminder.source === "MANUAL" && (
            <button
              onClick={() => onDelete(reminder.id)}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
              aria-label="Delete reminder"
              title="Delete reminder"
            >
              <Trash2 className="h-3.5 w-3.5" />
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
    <form onSubmit={submit} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">New reminder</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Title</span>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="e.g. Email my supervisor" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Remind me at</span>
          <input type="datetime-local" className={inputCls} value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Linked entry (optional)</span>
        <select className={inputCls} value={entryId} onChange={(e) => setEntryId(e.target.value)}>
          <option value="">None</option>
          {entries.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Note (optional)</span>
        <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {saving ? "Saving..." : "Save reminder"}
        </button>
      </div>
    </form>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────

function RuleToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition shrink-0 mt-0.5 ${checked ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function ReminderRules({ onSaved }: { onSaved: () => void }) {
  const [rules, setRules] = useState<ReminderSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchReminderSettings().then(setRules).catch(() => setMessage("Could not load your reminder rules."));
  }, []);

  if (!rules) {
    return message ? <p className="text-xs text-red-600">{message}</p> : <LoadingState message="Loading rules..." />;
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
      setMessage("Rules saved.");
      onSaved();
    } catch (err) {
      setMessage(errorMessage(err, "Could not save your rules."));
    } finally {
      setSaving(false);
    }
  };

  const numberCls = "w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      <RuleToggle
        label="Upcoming due dates"
        description="Remind me before an open entry is due."
        checked={rules.dueSoonEnabled}
        onChange={(v) => set({ dueSoonEnabled: v })}
      />
      {rules.dueSoonEnabled && (
        <label className="flex items-center gap-2 text-xs text-slate-600 pl-1">
          Days before
          <input
            type="number" min={0} max={30} className={numberCls} aria-label="Days before due date"
            value={rules.dueSoonDays}
            onChange={(e) => set({ dueSoonDays: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
          />
        </label>
      )}
      <RuleToggle
        label="Overdue entries"
        description="Remind me when an open entry passes its due date."
        checked={rules.overdueEnabled}
        onChange={(v) => set({ overdueEnabled: v })}
      />
      <RuleToggle
        label="Stalled entries"
        description="Remind me about open entries I haven't touched in a while."
        checked={rules.staleEnabled}
        onChange={(v) => set({ staleEnabled: v })}
      />
      {rules.staleEnabled && (
        <label className="flex items-center gap-2 text-xs text-slate-600 pl-1">
          After
          <input
            type="number" min={1} max={365} className={numberCls} aria-label="Days without progress"
            value={rules.staleDays}
            onChange={(e) => set({ staleDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
          />
          days without progress
        </label>
      )}
      <RuleToggle
        label="Upcoming tests & assessments"
        description="Remind me 5 days and 2 days before a dated assessment in My Grades."
        checked={rules.assessmentEnabled}
        onChange={(v) => set({ assessmentEnabled: v })}
      />
      <RuleToggle
        label="Daily logbook reminder"
        description="Remind me if I haven't logged anything by a set time."
        checked={rules.dailyLogEnabled}
        onChange={(v) => set({ dailyLogEnabled: v })}
      />
      {rules.dailyLogEnabled && (
        <label className="flex items-center gap-2 text-xs text-slate-600 pl-1">
          At
          <input
            type="time" className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Daily reminder time"
            value={rules.dailyLogTime}
            onChange={(e) => e.target.value && set({ dailyLogTime: e.target.value })}
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500">{message}</span>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "Saving..." : "Save rules"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [pending, setPending] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("due");
  const [showForm, setShowForm] = useState(false);

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

  const tabs: { key: Tab; label: string; items: Reminder[] }[] = [
    { key: "due", label: "Due now", items: due },
    { key: "upcoming", label: "Upcoming", items: upcoming },
    { key: "history", label: "Completed & dismissed", items: history },
  ];
  const current = tabs.find((t) => t.key === tab)!;

  const emptyCopy: Record<Tab, { title: string; description: string }> = {
    due: { title: "Nothing needs your attention", description: "Reminders appear here once their time comes or one of your rules is triggered." },
    upcoming: { title: "No upcoming reminders", description: "Reminders you set for later wait here until their time." },
    history: { title: "No finished reminders yet", description: "Reminders you complete or dismiss are kept here." },
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Reminders"
        subtitle="Set your own reminders, or let your rules remind you about due dates and unlogged work."
        action={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" /> New reminder
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2 space-y-3">
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-slate-400">{t.items.length}</span>
              </button>
            ))}
          </div>

          {actionError && <p className="text-xs text-red-600">{actionError}</p>}

          {loading ? (
            <LoadingState message="Loading reminders..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : current.items.length === 0 ? (
            <EmptyState
              icon={tab === "history" ? CheckCircle2 : tab === "due" ? BellRing : CalendarClock}
              {...emptyCopy[tab]}
            />
          ) : (
            <ul className="space-y-2">
              {current.items.map((r) => (
                <ReminderCard key={r.id} reminder={r} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </section>

        <aside className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Reminder rules</h2>
          </div>
          <div className="p-4">
            <ReminderRules onSaved={load} />
          </div>
        </aside>
      </div>
    </div>
  );
}
