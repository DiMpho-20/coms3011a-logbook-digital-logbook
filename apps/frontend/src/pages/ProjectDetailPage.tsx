import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  FileText,
  CalendarDays,
  Plus,
  Archive,
  ArchiveRestore,
  Check,
  Circle,
  MoreVertical,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  fetchProject,
  fetchProjects,
  fetchProjectTimeSummary,
  fetchEntries,
  fetchEntryFields,
  toggleProjectStatus,
  createEntry,
  updateEntry,
  deleteEntry,
  fetchEntryFormatVersions,
  fetchTags,
  setEntryArchived,
  setEntriesArchived,
  type ArchivedFilter,
  type Project,
  type ProjectWithFields,
  type TimeSummary,
  type Entry,
  type EntryField,
  type EntryFieldValue,
  type ChecklistItem,
} from "../api";
import { formatDuration, todayISO, defaultValuesForFields, isEmptyValue, entryDateKey } from "../lib/utils";
import StatCard from "../components/StatCard";
import EntryCard from "../components/EntryCard";
import Modal from "../components/Modal";
import Stopwatch from "../components/Stopwatch";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import TagList from "../components/TagList";
import TagInput, { type TagInputHandle } from "../components/TagInput";
import ChecklistInput from "../components/ChecklistInput";
import EntryHistoryModal from "../components/EntryHistoryModal";
import DeleteProjectModal from "../components/DeleteProjectModal";
import { formulaIdsToNames, previewComputedValues } from "../lib/formulas";
import { SYNC_EVENT } from "../lib/offlineEntries";
import { resolveSyncedId } from "../lib/offlineProjects";

type EntryView = "active" | "archived" | "all";

const ARCHIVED_FILTER: Record<EntryView, ArchivedFilter> = {
  active: "exclude",
  archived: "only",
  all: "include",
};

function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: "long" });
  const year = date.getFullYear();
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday} · ${day} ${month} ${year}`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Entry view, history dialog and bulk selection (US20-22, US30)
  const [entryView, setEntryView] = useState<EntryView>("active");
  const [historyEntry, setHistoryEntry] = useState<Entry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasLoadedRef = useRef(false);

  // A project created offline gets a new id when it syncs; follow it there.
  useEffect(() => {
    if (!id?.startsWith("offline-")) return;
    const followSync = () => {
      const synced = resolveSyncedId(id);
      if (synced !== id) navigate(`/projects/${synced}`, { replace: true });
    };
    followSync();
    window.addEventListener(SYNC_EVENT, followSync);
    return () => window.removeEventListener(SYNC_EVENT, followSync);
  }, [id, navigate]);

  const [project, setProject] = useState<ProjectWithFields | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [formatHistoryOpen, setFormatHistoryOpen] = useState(false);
  const [formatVersions, setFormatVersions] = useState<{ id: string; version: number; fields: EntryField[]; createdAt: string }[]>([]);

  // New entry form state
  const [entryDate, setEntryDate] = useState(todayISO());
  const [entryDuration, setEntryDuration] = useState("");
  const [entryDueDate, setEntryDueDate] = useState("");
  const [entryValues, setEntryValues] = useState<Record<string, EntryFieldValue>>({});
  // What each computed field will come to, updated as the form is filled in.
  const computedPreview = useMemo(() => previewComputedValues(fields, entryValues), [fields, entryValues]);
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const entryTagInputRef = useRef<TagInputHandle>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  useEffect(() => {
    fetchTags().then((t) => setTagSuggestions(t.map((tag) => tag.name))).catch(() => {});
    fetchProjects().then(setAllProjects).catch(() => {});
  }, []);

  // Candidates for a REFERENCE field: every other project, for linking one to another.
  const otherProjects = useMemo(
    () => allProjects.filter((p) => p.id !== id),
    [allProjects, id]
  );

  const load = useCallback(async () => {
    if (!id) return;
    // Switching between active and archived entries reloads in place rather
    // than blanking the whole page behind a spinner.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const [proj, sum, ents, flds] = await Promise.all([
        fetchProject(id),
        fetchProjectTimeSummary(id),
        fetchEntries(id, { archived: ARCHIVED_FILTER[entryView] }),
        fetchEntryFields(id),
      ]);
      hasLoadedRef.current = true;
      setProject(proj);
      setSummary(sum);
      setEntries(ents);
      setFields(flds);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load project.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, entryView]);

  useEffect(() => {
    load();
  }, [load]);

  // Populate (or reset) form fields whenever the modal opens
  useEffect(() => {
    if (!entryModalOpen) return;
    if (editingEntry) {
      setEntryValues({ ...editingEntry.values });
      setEntryDate(editingEntry.entryDate ? editingEntry.entryDate.slice(0, 10) : todayISO());
      setEntryDuration(String(editingEntry.durationMinutes || ""));
      setEntryDueDate(editingEntry.dueDate ? editingEntry.dueDate.slice(0, 10) : "");
      setEntryTags(editingEntry.tags ?? []);
    } else {
      setEntryValues(defaultValuesForFields(fields));
      setEntryDate(todayISO());
      setEntryDuration("");
      setEntryDueDate("");
      setEntryTags([]);
    }
    setEntryError(null);
  }, [entryModalOpen, editingEntry, fields]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    sortedEntries.forEach((e) => {
      const key = entryDateKey(e);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sortedEntries]);

  const handleToggleArchive = async () => {
    if (!project) return;
    const newStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      await toggleProjectStatus(project.id, newStatus);
      const updated = await fetchProject(project.id);
      setProject(updated);
    } catch (err) {
      console.error("Failed to update project status:", err);
    }
    setMoreOpen(false);
  };

  const openFormatHistory = async () => {
    if (!id) return;
    try {
      setFormatVersions(await fetchEntryFormatVersions(id));
      setFormatHistoryOpen(true);
    } catch {
      setEntryError("Couldn't load format history.");
    }
  };

  const handleFieldChange = (fieldId: string, value: EntryFieldValue) => {
    setEntryValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const openNewEntryModal = () => {
    setEditingEntry(null);
    setEntryModalOpen(true);
  };

  const openEditEntryModal = (entry: Entry) => {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  };

  const handleDeleteEntry = async (entry: Entry) => {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    try {
      await deleteEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      if (id) fetchProjectTimeSummary(id).then(setSummary).catch(() => {});
    } catch {
      alert("Couldn't delete that entry. Try again.");
    }
  };

  // Archiving moves an entry out of the active list without deleting it;
  // from the archive, the same button brings it back.
  const handleArchiveEntry = async (entry: Entry) => {
    setArchiveError(null);
    try {
      const updated = await setEntryArchived(entry.id, !entry.archivedAt);
      setEntries((prev) =>
        entryView === "all"
          ? prev.map((e) => (e.id === updated.id ? updated : e))
          : prev.filter((e) => e.id !== updated.id)
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    } catch {
      setArchiveError("Couldn't update that entry. Check your connection and try again.");
    }
  };

  const handleSelectEntry = (entry: Entry, isSelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
  };

  // In the archive view the bulk action restores; everywhere else it archives.
  const bulkArchives = entryView !== "archived";

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    setArchiveError(null);
    try {
      await setEntriesArchived([...selectedIds], bulkArchives);
      await load();
    } catch {
      setArchiveError("Couldn't update the selected entries. Check your connection and try again.");
    }
  };

  const handleVersionRestored = (updated: Entry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    if (id) fetchProjectTimeSummary(id).then(setSummary).catch(() => {});
  };

  const handleToggleChecklistItem = async (entry: Entry, field: EntryField, itemIndex: number) => {
    const current = Array.isArray(entry.values?.[field.id]) ? (entry.values[field.id] as ChecklistItem[]) : [];
    const items = current.map((item, i) => (i === itemIndex ? { ...item, checked: !item.checked } : item));

    // Optimistic update so the checkbox responds immediately; reload from the
    // server if the save fails so the card doesn't drift from what's stored.
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, values: { ...e.values, [field.id]: items } } : e))
    );
    try {
      const updated = await updateEntry(entry.id, { values: { [field.id]: items } });
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch {
      load();
    }
  };

  const closeEntryModal = () => {
    setEntryModalOpen(false);
    setEditingEntry(null);
  };

  const handleEntrySubmit = async () => {
    if (!id) return;
    // Blank means "haven't spent any time on this yet" — not an error.
    const minutes = entryDuration.trim() === "" ? 0 : parseInt(entryDuration, 10);
    if (Number.isNaN(minutes) || minutes < 0) {
      setEntryError("Time spent must be a number, 0 or more.");
      return;
    }

    const missing = fields.find((f) => f.required && isEmptyValue(entryValues[f.id]));
    if (missing) {
      setEntryError(`"${missing.name}" is required.`);
      return;
    }

    setEntryError(null);
    setEntrySubmitting(true);
    try {
      // Read the tags input directly rather than the `entryTags` state:
      // clicking Save blurs the tags input in the same tick, and that
      // blur's commit hasn't reached `entryTags` yet when this runs.
      const finalTags = entryTagInputRef.current?.getValue() ?? entryTags;

      if (editingEntry) {
        const updated = await updateEntry(editingEntry.id, {
          durationMinutes: minutes,
          values: entryValues,
          tags: finalTags,
          dueDate: entryDueDate || null,
          entryDate: entryDate || null,
        });
        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } else {
        const entryData: {
          durationMinutes: number;
          values: Record<string, EntryFieldValue>;
          dueDate?: string;
          entryDate?: string;
          tags?: string[];
        } = {
          durationMinutes: minutes,
          values: entryValues,
          tags: finalTags,
        };
        if (entryDueDate) entryData.dueDate = entryDueDate;
        if (entryDate && entryDate !== todayISO()) entryData.entryDate = entryDate;

        const newEntry = await createEntry(id, entryData);
        // A new entry is active, so it has no place in the archive view.
        if (entryView !== "archived") setEntries((prev) => [newEntry, ...prev]);
      }

      closeEntryModal();
      if (id) {
        fetchProjectTimeSummary(id).then(setSummary).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (editingEntry ? "Couldn't update that entry. Try again." : "Couldn't save that entry. Try again.");
      setEntryError(msg);
    } finally {
      setEntrySubmitting(false);
    }
  };

  const isActive = project?.status === "ACTIVE";

  if (loading) return <LoadingState message="Loading project..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">Project not found.</p>
        <Link to="/projects" className="text-xs text-blue-600 font-medium hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition font-medium"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
            {/* Status dropdown */}
            <div className="relative">
              <button
                onClick={handleToggleArchive}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                {isActive ? "Active" : "Archived"}
              </button>
            </div>
            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-8 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44">
                  <button
                    onClick={handleToggleArchive}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition ${
                      isActive
                        ? "text-amber-600 hover:bg-amber-50"
                        : "text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {isActive ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                    {isActive ? "Archive project" : "Unarchive project"}
                  </button>
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete project
                  </button>
                </div>
              )}
            </div>
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 mt-1">{project.description}</p>
          )}
          <TagList tags={project.tags} className="mt-2" />
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Clock} label="Total Time" value={formatDuration(summary.totalMinutes)} color="blue" />
          <StatCard icon={FileText} label="Entries" value={summary.entryCount} color="emerald" />
          <StatCard
            icon={CalendarDays}
            label="Last Entry"
            value={summary.lastEntryAt ? relativeDay(summary.lastEntryAt) : "—"}
            color="orange"
          />
        </div>
      )}

      {/* Entry Format */}
      {fields.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Entry Format</h2>
            <button type="button" onClick={openFormatHistory} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Format history</button>
          </div>
          <div className="p-4 space-y-2">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-3">
                {f.required ? (
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-800 min-w-[120px]">
                  {f.name}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                  {f.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Entries</h2>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs font-medium" role="group" aria-label="Which entries to show">
              {(["active", "archived", "all"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setEntryView(view)}
                  aria-pressed={entryView === view}
                  className={`px-2.5 py-1 transition ${
                    entryView === view ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {view === "active" ? "Active" : view === "archived" ? "Archived" : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleArchiveSelected}
                className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                {bulkArchives ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                {bulkArchives ? "Archive" : "Restore"} selected ({selectedIds.size})
              </button>
            )}
            <button
              onClick={openNewEntryModal}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
            >
              <Plus className="h-3.5 w-3.5" /> New Entry
            </button>
          </div>
        </div>
        <div className="p-4">
          {archiveError && (
            <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {archiveError}
            </p>
          )}
          {groupedEntries.length === 0 && entryView === "archived" ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-400">No archived entries in this project.</p>
            </div>
          ) : groupedEntries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-400 mb-3">No entries logged for this project yet.</p>
              <button
                onClick={openNewEntryModal}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" /> Add First Entry
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedEntries.map(([dateKey, dayEntries]) => (
                <div key={dateKey}>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    {dateHeading(dateKey)}
                  </p>
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        fields={fields}
                        onEdit={openEditEntryModal}
                        onDelete={handleDeleteEntry}
                        onToggleChecklistItem={handleToggleChecklistItem}
                        onHistory={setHistoryEntry}
                        onArchive={handleArchiveEntry}
                        selected={selectedIds.has(entry.id)}
                        onSelect={handleSelectEntry}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DeleteProjectModal
        project={deleteOpen ? project : null}
        entryCount={summary?.entryCount}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate("/projects", { replace: true })}
        onArchiveInstead={async () => {
          setDeleteOpen(false);
          await handleToggleArchive();
        }}
      />

      <EntryHistoryModal
        entry={historyEntry}
        fields={fields}
        onClose={() => setHistoryEntry(null)}
        onRestored={handleVersionRestored}
      />

      <Modal open={formatHistoryOpen} onClose={() => setFormatHistoryOpen(false)} title="Entry format history">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {formatVersions.length === 0 ? <p className="text-sm text-slate-500">No saved format versions yet.</p> : formatVersions.map((version) => (
            <div key={version.id} className="border border-slate-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800">Version {version.version} <span className="text-xs font-normal text-slate-400">· {new Date(version.createdAt).toLocaleString()}</span></p>
              <ul className="mt-2 text-xs text-slate-600 space-y-1">
                {version.fields.map((field) => <li key={field.id}>{field.name} <span className="text-slate-400">({field.type})</span>{field.formula ? ` — ${formulaIdsToNames(field.formula, version.fields)}` : ""}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Modal>

      {/* New / Edit Entry Modal */}
      <Modal
        open={entryModalOpen}
        onClose={closeEntryModal}
        title={editingEntry ? "Edit Entry" : "New Entry"}
      >
        <div className="space-y-4">
          {entryError && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {entryError}
            </p>
          )}

          {/* Entry fields, in the order the project defines them — a TEXT
              field defined first naturally reads as "describe this entry",
              with everything else the project asks for listed below it. */}
          {fields.length > 0 && (
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    {field.name}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {field.type === "TEXT" && (
                    <textarea
                      rows={2}
                      placeholder={`Add ${field.name.toLowerCase()}...`}
                      value={(entryValues[field.id] as string) || ""}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                  )}
                  {field.type === "NUMBER" && (
                    <input
                      type="number"
                      value={(entryValues[field.id] as number | string) ?? ""}
                      onChange={(e) =>
                        handleFieldChange(field.id, e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {field.type === "DATE" && (
                    <input
                      type="date"
                      value={(entryValues[field.id] as string) || todayISO()}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {field.type === "BOOLEAN" && (
                    <label className="flex items-center gap-2 h-[38px] px-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={!!entryValues[field.id]}
                        onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-slate-600">Yes</span>
                    </label>
                  )}
                  {field.type === "TAGS" && (
                    <input type="text" placeholder="Comma-separated tags" value={Array.isArray(entryValues[field.id]) ? (entryValues[field.id] as string[]).join(", ") : ""}
                      onChange={(e) => handleFieldChange(field.id, e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  )}
                  {field.type === "CHECKLIST" && (
                    <ChecklistInput
                      value={Array.isArray(entryValues[field.id]) ? (entryValues[field.id] as { label: string; checked: boolean }[]) : []}
                      onChange={(items) => handleFieldChange(field.id, items)}
                    />
                  )}
                  {field.type === "LINK" && (
                    <input type="url" placeholder="https://…" value={(entryValues[field.id] as string) || ""} onChange={(e) => handleFieldChange(field.id, e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  )}
                  {field.type === "REFERENCE" && (
                    <select
                      value={(entryValues[field.id] as { id?: string } | null)?.id || ""}
                      onChange={(e) => {
                        const target = otherProjects.find((p) => p.id === e.target.value);
                        handleFieldChange(field.id, target ? { id: target.id, label: target.name, kind: "project" } : null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white"
                    >
                      <option value="">— No project —</option>
                      {otherProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                  {field.type === "COMPUTED" && (
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-sm font-medium text-slate-800">
                        {computedPreview[field.id] == null ? "—" : Number(computedPreview[field.id]!.toFixed(4))}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Calculated automatically from {formulaIdsToNames(field.formula ?? "", fields)}
                        {computedPreview[field.id] === null && " once those fields are filled in"}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Date + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Time spent (minutes, optional)</label>
              <input
                type="number"
                min={0}
                placeholder="Leave blank if not started"
                value={entryDuration}
                onChange={(e) => setEntryDuration(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Live stopwatch */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Stopwatch</label>
            <Stopwatch
              compact
              onMinutesChange={(mins) => setEntryDuration(String(mins))}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Tags</label>
            <TagInput ref={entryTagInputRef} value={entryTags} onChange={setEntryTags} suggestions={tagSuggestions} placeholder="e.g. urgent, research" />
          </div>

          {/* Due date */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Due date</label>
            <input
              type="date"
              value={entryDueDate}
              onChange={(e) => setEntryDueDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={closeEntryModal}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEntrySubmit}
              disabled={entrySubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {entrySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editingEntry ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
