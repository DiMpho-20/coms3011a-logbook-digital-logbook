import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  fetchProjects,
  fetchTags,
  createEntry,
  updateEntry,
  type Entry,
  type EntryField,
  type EntryFieldValue,
  type Project,
  type RecurrencePattern,
} from "../../api";
import { defaultValuesForFields, isEmptyValue, todayISO } from "../../lib/utils";
import { entryDefaults, rememberEntryDefaults } from "../../lib/quickCapture";
import { previewComputedValues } from "../../lib/formulas";
import type { TagInputHandle } from "../../components/TagInput";

/** The few things the form asks of the entries list once an entry is saved. */
export interface EntryWriter {
  insertEntry: (entry: Entry) => void;
  replaceEntry: (entry: Entry) => void;
  refreshSummary: () => void;
}

export interface EntryForm {
  open: boolean;
  editingEntry: Entry | null;
  entryDate: string;
  setEntryDate: (value: string) => void;
  entryDuration: string;
  setEntryDuration: (value: string) => void;
  entryDueDate: string;
  setEntryDueDate: (value: string) => void;
  entryRecurring: boolean;
  setEntryRecurring: (value: boolean) => void;
  recurrencePattern: RecurrencePattern;
  setRecurrencePattern: (pattern: RecurrencePattern) => void;
  entryValues: Record<string, EntryFieldValue>;
  handleFieldChange: (fieldId: string, value: EntryFieldValue) => void;
  /** What each computed field will come to, as the form is filled in. */
  computedPreview: Record<string, number | null>;
  entryTags: string[];
  setEntryTags: (tags: string[]) => void;
  /** Whether the open new-entry form started from the last entry's values. */
  entryPrefilled: boolean;
  tagInputRef: RefObject<TagInputHandle | null>;
  tagSuggestions: string[];
  allProjects: Project[];
  entryError: string | null;
  setEntryError: (message: string | null) => void;
  entrySubmitting: boolean;
  formRef: RefObject<HTMLDivElement | null>;
  openNew: () => void;
  openEdit: (entry: Entry) => void;
  close: () => void;
  submit: () => Promise<void>;
}

/**
 * The new/edit entry form: what is in it, what it starts from and what
 * happens when Save is pressed.
 *
 * Opening a new entry starts from the last one's duration, tags and repeated
 * values, so capture is mostly the description — and says so, rather than
 * quietly carrying values forward.
 */
export function useEntryForm({
  id, fields, writer,
}: {
  id: string | undefined;
  fields: EntryField[];
  writer: EntryWriter;
}): EntryForm {
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [entryDuration, setEntryDuration] = useState("");
  const [entryDueDate, setEntryDueDate] = useState("");
  const [entryRecurring, setEntryRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("WEEKLY");
  const [entryValues, setEntryValues] = useState<Record<string, EntryFieldValue>>({});
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [entryPrefilled, setEntryPrefilled] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const entryTagInputRef = useRef<TagInputHandle>(null);
  const entryFormRef = useRef<HTMLDivElement>(null);

  const computedPreview = useMemo(() => previewComputedValues(fields, entryValues), [fields, entryValues]);

  useEffect(() => {
    fetchTags().then((t) => setTagSuggestions(t.map((tag) => tag.name))).catch(() => {});
    fetchProjects().then(setAllProjects).catch(() => {});
  }, []);

  // Put the cursor in the first field, so capture needs no mouse.
  useEffect(() => {
    if (!entryModalOpen) return;
    const frame = requestAnimationFrame(() => {
      entryFormRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [entryModalOpen]);

  // Populate (or reset) form fields whenever the modal opens
  useEffect(() => {
    if (!entryModalOpen) return;
    if (editingEntry) {
      setEntryValues({ ...editingEntry.values });
      setEntryDate(editingEntry.entryDate ? editingEntry.entryDate.slice(0, 10) : todayISO());
      setEntryDuration(String(editingEntry.durationMinutes || ""));
      setEntryDueDate(editingEntry.dueDate ? editingEntry.dueDate.slice(0, 10) : "");
      setEntryTags(editingEntry.tags ?? []);
      setEntryRecurring(false);
    } else {
      // Start from what is predictable: the last entry's time, tags and
      // repeated values, so quick capture is mostly the description.
      const carried = id ? entryDefaults(id, fields) : null;
      setEntryValues({ ...defaultValuesForFields(fields), ...((carried?.values ?? {}) as Record<string, EntryFieldValue>) });
      setEntryDate(todayISO());
      setEntryDuration(carried?.duration ?? "");
      setEntryDueDate("");
      setEntryTags(carried?.tags ?? []);
      setEntryPrefilled(Boolean(carried && (carried.duration || carried.tags.length || Object.keys(carried.values).length)));
      setEntryRecurring(false);
      setRecurrencePattern("WEEKLY");
    }
    setEntryError(null);
  }, [entryModalOpen, editingEntry, fields, id]);

  const handleFieldChange = (fieldId: string, value: EntryFieldValue) => {
    setEntryValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const openNew = useCallback(() => {
    setEditingEntry(null);
    setEntryModalOpen(true);
  }, []);

  const openEdit = useCallback((entry: Entry) => {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  }, []);

  const close = useCallback(() => {
    setEntryModalOpen(false);
    setEditingEntry(null);
  }, []);

  const handleSubmit = async () => {
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
        writer.replaceEntry(updated);
      } else {
        const entryData: {
          durationMinutes: number;
          values: Record<string, EntryFieldValue>;
          dueDate?: string;
          entryDate?: string;
          tags?: string[];
          recurrence?: { pattern: RecurrencePattern };
        } = {
          durationMinutes: minutes,
          values: entryValues,
          tags: finalTags,
        };
        if (entryDueDate) entryData.dueDate = entryDueDate;
        if (entryDate && entryDate !== todayISO()) entryData.entryDate = entryDate;
        if (entryRecurring) entryData.recurrence = { pattern: recurrencePattern };

        const newEntry = await createEntry(id, entryData);
        rememberEntryDefaults(id, fields, { durationMinutes: minutes, values: entryValues, tags: finalTags });
        writer.insertEntry(newEntry);
      }

      close();
      writer.refreshSummary();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (editingEntry ? "Couldn't update that entry. Try again." : "Couldn't save that entry. Try again.");
      setEntryError(msg);
    } finally {
      setEntrySubmitting(false);
    }
  };

  return {
    open: entryModalOpen,
    editingEntry,
    entryDate,
    setEntryDate,
    entryDuration,
    setEntryDuration,
    entryDueDate,
    setEntryDueDate,
    entryRecurring,
    setEntryRecurring,
    recurrencePattern,
    setRecurrencePattern,
    entryValues,
    handleFieldChange,
    computedPreview,
    entryTags,
    setEntryTags,
    entryPrefilled,
    tagInputRef: entryTagInputRef,
    tagSuggestions,
    allProjects,
    entryError,
    setEntryError,
    entrySubmitting,
    formRef: entryFormRef,
    openNew,
    openEdit,
    close,
    submit: handleSubmit,
  };
}
