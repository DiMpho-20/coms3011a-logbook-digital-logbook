import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchProject,
  fetchProjectTimeSummary,
  fetchEntries,
  fetchEntryFields,
  toggleProjectStatus,
  deleteEntry,
  updateEntry,
  setEntryArchived,
  setEntriesArchived,
  setRecurrenceEnabled,
  type ChecklistItem,
  type Entry,
  type EntryField,
  type ProjectWithFields,
  type TimeSummary,
} from "../../api";
import { entryDateKey } from "../../lib/utils";
import { forgetProject } from "../../lib/quickCapture";
import { useToast } from "../../components/ToastContext";
import { ARCHIVED_FILTER, type EntryView } from "./format";

export interface ProjectEntries {
  project: ProjectWithFields | null;
  summary: TimeSummary | null;
  entries: Entry[];
  fields: EntryField[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  entryView: EntryView;
  setEntryView: (view: EntryView) => void;
  /** The listed entries, newest first and grouped under the day they happened. */
  groupedEntries: [string, Entry[]][];
  archiveError: string | null;
  selectedIds: Set<string>;
  /** The bulk action archives everywhere except in the archive, where it restores. */
  bulkArchives: boolean;
  handleToggleArchive: () => Promise<void>;
  handleDeleteEntry: (entry: Entry) => Promise<void>;
  handleArchiveEntry: (entry: Entry) => Promise<void>;
  handleSelectEntry: (entry: Entry, isSelected: boolean) => void;
  handleArchiveSelected: () => Promise<void>;
  handleVersionRestored: (updated: Entry) => void;
  handleToggleChecklistItem: (entry: Entry, field: EntryField, itemIndex: number) => Promise<void>;
  handleDisableRecurrence: (entry: Entry) => Promise<void>;
  /** A newly saved entry, unless this view excludes it. */
  insertEntry: (entry: Entry) => void;
  /** A saved change to one entry already in the list. */
  replaceEntry: (entry: Entry) => void;
  refreshSummary: () => void;
}

/**
 * One project: its format, its time summary and its entries, plus every
 * way an entry can change from this page.
 *
 * Switching between active and archived reloads in place rather than
 * blanking the page, and every mutation that can move the totals refreshes
 * the summary rather than guessing the new one.
 */
export function useProjectEntries(id: string | undefined): ProjectEntries {
  const toast = useToast();
  const [entryView, setEntryView] = useState<EntryView>("active");
  const [project, setProject] = useState<ProjectWithFields | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

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
      forgetProject(id);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, entryView]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshSummary = useCallback(() => {
    if (!id) return;
    fetchProjectTimeSummary(id).then(setSummary).catch(() => {});
  }, [id]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );

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
  };

  const handleDeleteEntry = async (entry: Entry) => {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    try {
      await deleteEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      refreshSummary();
    } catch {
      toast.error("Couldn't delete that entry. Try again.");
    }
  };

  const handleDisableRecurrence = async (entry: Entry) => {
    if (!entry.recurrence || !confirm("Stop creating future occurrences of this entry?")) return;
    try {
      const recurrence = await setRecurrenceEnabled(entry.recurrence.id, false);
      setEntries((current) => current.map((item) =>
        item.recurrence?.id === recurrence?.id ? { ...item, recurrence } : item
      ));
    } catch {
      setArchiveError("Couldn't stop the recurrence. Try again.");
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
    refreshSummary();
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

  const insertEntry = (entry: Entry) => {
    // A new entry is active, so it has no place in the archive view.
    if (entryView !== "archived") setEntries((prev) => [entry, ...prev]);
  };

  const replaceEntry = (entry: Entry) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
  };

  return {
    project,
    summary,
    entries,
    fields,
    loading,
    error,
    load,
    entryView,
    setEntryView,
    groupedEntries,
    archiveError,
    selectedIds,
    bulkArchives,
    handleToggleArchive,
    handleDeleteEntry,
    handleArchiveEntry,
    handleSelectEntry,
    handleArchiveSelected,
    handleVersionRestored,
    handleToggleChecklistItem,
    handleDisableRecurrence,
    insertEntry,
    replaceEntry,
    refreshSummary,
  };
}
