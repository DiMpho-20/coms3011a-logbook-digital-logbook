import { useEffect, useMemo, useState } from "react";
import { CalendarSearch, History, Loader2, RotateCcw } from "lucide-react";
import {
  fetchEntryAtDate,
  fetchEntryHistory,
  restoreEntryVersion,
  type Entry,
  type EntryAtDate,
  type EntryField,
  type EntryHistory,
  type EntryVersion,
} from "../api";
import { formatDuration, todayISO } from "../lib/utils";
import Modal from "./Modal";
import EntryCard from "./EntryCard";

interface EntryHistoryModalProps {
  /** The entry whose history to show; the dialog is closed while this is null. */
  entry: Entry | null;
  /** The project's live fields, for entries that carry no format of their own. */
  fields?: EntryField[];
  onClose: () => void;
  /** Called with the entry's new current state after a version is restored. */
  onRestored: (entry: Entry) => void;
}

const REASON_LABELS: Record<EntryVersion["reason"], string> = {
  CREATED: "Created",
  UPDATED: "Edited",
  RESTORED: "Restored",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A version's content in the shape EntryCard renders. */
function versionAsEntry(entry: Entry, version: EntryVersion): Entry {
  return {
    ...version.snapshot,
    id: entry.id,
    projectId: entry.projectId,
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    archivedAt: null,
  };
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === "object" && "label" in item
        ? `${(item as { checked?: boolean }).checked ? "☑" : "☐"} ${(item as { label: string }).label}`
        : String(item)))
      .join(", ") || "(empty)";
  }
  if (typeof value === "object") {
    const reference = value as { label?: string; id?: string };
    return reference.label || reference.id || JSON.stringify(value);
  }
  return String(value);
}

/** What differs between an older version and the current one, field by field. */
function differences(older: EntryVersion, current: EntryVersion, fallbackFields: EntryField[]) {
  const a = older.snapshot;
  const b = current.snapshot;
  const rows: { label: string; then: string; now: string }[] = [];
  const add = (label: string, then: unknown, now: unknown) => {
    const thenText = describeValue(then);
    const nowText = describeValue(now);
    if (thenText !== nowText) rows.push({ label, then: thenText, now: nowText });
  };

  add("Time spent", formatDuration(a.durationMinutes), formatDuration(b.durationMinutes));
  add("Date", a.entryDate?.slice(0, 10), b.entryDate?.slice(0, 10));
  add("Due date", a.dueDate?.slice(0, 10), b.dueDate?.slice(0, 10));
  add("Status", a.status === "DONE" ? "Done" : "Open", b.status === "DONE" ? "Done" : "Open");
  add("Tags", a.tags ?? [], b.tags ?? []);

  // Named by whichever version knows the field — a field may exist in only one.
  const names = new Map<string, string>();
  [...fallbackFields, ...(b.format?.fields ?? []), ...(a.format?.fields ?? [])].forEach((f) => names.set(f.id, f.name));
  const fieldIds = new Set([...Object.keys(a.values ?? {}), ...Object.keys(b.values ?? {})]);
  fieldIds.forEach((id) => add(names.get(id) ?? "Removed field", a.values?.[id], b.values?.[id]));
  return rows;
}

export default function EntryHistoryModal({ entry, fields = [], onClose, onRestored }: EntryHistoryModalProps) {
  const [history, setHistory] = useState<EntryHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [dateResult, setDateResult] = useState<{ date: string; result: EntryAtDate } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (entryId: string, select?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEntryHistory(entryId);
      setHistory(data);
      setSelected(select ?? data.currentVersion);
    } catch {
      setError("Couldn't load this entry's history. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHistory(null);
    setDateResult(null);
    setConfirming(false);
    setNotice(null);
    setDate(todayISO());
    if (entry) void load(entry.id);
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(
    () => history?.versions.find((v) => v.version === history.currentVersion) ?? null,
    [history]
  );
  const shown = useMemo(
    () => history?.versions.find((v) => v.version === selected) ?? null,
    [history, selected]
  );
  const changes = useMemo(
    () => (shown && current && shown.version !== current.version ? differences(shown, current, fields) : []),
    [shown, current, fields]
  );

  const selectVersion = (version: number) => {
    setSelected(version);
    setConfirming(false);
    setNotice(null);
  };

  const viewAtDate = async () => {
    if (!entry || !date) return;
    // The whole chosen day counts: "as it was on the 3rd" includes edits made that evening.
    const endOfDay = new Date(`${date}T23:59:59.999`);
    try {
      const result = await fetchEntryAtDate(entry.id, endOfDay);
      setDateResult({ date, result });
      if (result.existed) selectVersion(result.version.version);
    } catch {
      setError("Couldn't look up that date. Try again.");
    }
  };

  const restore = async () => {
    if (!entry || !shown) return;
    setRestoring(true);
    setError(null);
    try {
      const result = await restoreEntryVersion(entry.id, shown.version);
      onRestored(result.entry);
      setConfirming(false);
      setDateResult(null);
      setNotice(
        `Version ${shown.version} is now the current entry, saved as version ${result.version.version}.` +
          (result.skippedFields > 0
            ? ` ${result.skippedFields} field${result.skippedFields === 1 ? " has" : "s have"} since been deleted from the project, so ${result.skippedFields === 1 ? "its value" : "their values"} could not come back.`
            : "")
      );
      await load(entry.id, result.version.version);
    } catch {
      setError("Couldn't restore that version. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  const dateLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <Modal open={entry !== null} onClose={onClose} title="Entry history" wide>
      {loading && !history ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </div>
      ) : error && !history ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : history && entry && shown && current ? (
        <div className="space-y-4">
          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {notice && (
            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>
          )}

          {/* View as of a date (US21) */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="history-date" className="block text-[11px] font-medium text-slate-500 mb-1">
                See this entry as it was on
              </label>
              <input
                id="history-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={viewAtDate}
              disabled={!date}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <CalendarSearch className="h-3.5 w-3.5" /> Show
            </button>
          </div>
          {dateResult && (
            <p className={`text-xs font-medium rounded-lg px-3 py-2 border ${
              dateResult.result.existed
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : "text-amber-700 bg-amber-50 border-amber-200"
            }`}>
              {dateResult.result.existed
                ? `On ${dateLabel(dateResult.date)} this entry was at version ${dateResult.result.version.version}${
                    dateResult.result.isCurrent ? ", which is still the current version." : "."
                  }`
                : `This entry did not exist yet on ${dateLabel(dateResult.date)}. It was created on ${formatWhen(dateResult.result.entryCreatedAt)}.`}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-4">
            {/* Versions, oldest first (US20) */}
            <ol className="space-y-1.5" aria-label="Versions">
              {history.versions.map((version) => {
                const isSelected = version.version === shown.version;
                const isCurrent = version.version === history.currentVersion;
                return (
                  <li key={version.version}>
                    <button
                      type="button"
                      onClick={() => selectVersion(version.version)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                        isSelected ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">Version {version.version}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Current
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {REASON_LABELS[version.reason]}
                        {version.restoredFromVersion ? ` from version ${version.restoredFromVersion}` : ""}
                      </span>
                      <span className="block text-[11px] text-slate-400">{formatWhen(version.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* The selected version, compared with the current one (US21, US22) */}
            <div className="space-y-3 min-w-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {shown.version === current.version ? "Current version" : `Version ${shown.version}`}
                  <span className="normal-case font-normal text-slate-400"> · {formatWhen(shown.createdAt)}</span>
                </p>
                <EntryCard entry={versionAsEntry(entry, shown)} fields={fields} />
              </div>

              {shown.version !== current.version && (
                <>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Differences from the current version
                    </p>
                    {changes.length === 0 ? (
                      <p className="text-xs text-slate-500">Same content as the current version.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-400">
                              <th className="font-medium py-1 pr-3">Field</th>
                              <th className="font-medium py-1 pr-3">Version {shown.version}</th>
                              <th className="font-medium py-1">Current</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changes.map((row) => (
                              <tr key={row.label} className="border-t border-slate-100 align-top">
                                <td className="py-1 pr-3 text-slate-500">{row.label}</td>
                                <td className="py-1 pr-3 text-slate-800 break-words">{row.then}</td>
                                <td className="py-1 text-slate-800 break-words">{row.now}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {confirming ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs text-amber-800">
                        Make version {shown.version} the current entry? The current content is kept in the history,
                        so you can switch back later.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={restore}
                          disabled={restoring}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                          {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Confirm restore
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore version {shown.version}
                    </button>
                  )}
                </>
              )}

              {history.versions.length === 1 && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <History className="h-3.5 w-3.5" /> This entry hasn't been changed since it was created.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
