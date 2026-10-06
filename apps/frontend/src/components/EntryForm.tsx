import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Loader2, Check } from "lucide-react";
import Stopwatch from "./Stopwatch";
import ChecklistInput from "./ChecklistInput";
import ReferencePicker from "./ReferencePicker";
import { todayISO, defaultValuesForFields, isEmptyValue } from "../lib/utils";
import { entryDefaults, rememberEntryDefaults, rememberProject } from "../lib/quickCapture";
import { previewComputedValues, formulaIdsToNames } from "../lib/formulas";
import { createEntry, fetchEntryFields, type Project, type EntryField, type EntryFieldValue } from "../api";

interface EntryFormProps {
  projects: Project[];
  /** Pre-selected project ID; if set, the project selector is hidden. */
  projectId?: string;
  /** Initial selection when the selector is visible; defaults to the first project. */
  defaultProjectId?: string;
  /**
   * Fields for the selected project. Omit it and the form loads them itself
   * as the selection changes, which is how the quick-entry dialog follows
   * the selector across projects with different formats.
   */
  fields?: EntryField[];
  /** Called after successful save. */
  onSave: (entry: unknown) => void;
  /** Label for submit button. */
  submitLabel?: string;
  compact?: boolean;
}

export default function EntryForm({
  projects,
  projectId,
  defaultProjectId,
  fields,
  onSave,
  submitLabel = "Save Entry",
  compact = false,
}: EntryFormProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    projectId || defaultProjectId || projects[0]?.id || ""
  );
  const [loadedFields, setLoadedFields] = useState<EntryField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  // A caller-provided list wins; otherwise the form owns its fields.
  const fieldsForSelection = fields ?? loadedFields;
  const [duration, setDuration] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [values, setValues] = useState<Record<string, EntryFieldValue>>(
    defaultValuesForFields(fieldsForSelection)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Without a fields prop, load the selected project's format so every field
  // type it uses can be captured here, not just the four plainest ones.
  useEffect(() => {
    if (fields || !selectedProjectId) {
      setLoadedFields([]);
      return;
    }
    let cancelled = false;
    setFieldsLoading(true);
    fetchEntryFields(selectedProjectId)
      .then((data) => {
        if (!cancelled) setLoadedFields(data);
      })
      .catch(() => {
        // A project without a readable format is still capturable — it just
        // has no custom fields to show.
        if (!cancelled) setLoadedFields([]);
      })
      .finally(() => {
        if (!cancelled) setFieldsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fields, selectedProjectId]);

  // Reset when the project or its fields change — a different project means
  // a different format — and start from whatever the last entry in this
  // project carried, so anything predictable is already filled in.
  useEffect(() => {
    const carried = entryDefaults(selectedProjectId, fieldsForSelection);
    setValues({ ...defaultValuesForFields(fieldsForSelection), ...((carried?.values ?? {}) as Record<string, EntryFieldValue>) });
    setDuration(carried?.duration ?? "");
    setDueDate("");
    setError(null);
  }, [selectedProjectId, fieldsForSelection]);

  // A computed field fills itself in from the values around it.
  const computedPreview = useMemo(
    () => previewComputedValues(fieldsForSelection, values),
    [fieldsForSelection, values]
  );

  /** Start a fresh entry from the last one saved, matching the modal's flow. */
  const resetFromLastEntry = useCallback(
    (pid: string) => {
      const carried = entryDefaults(pid, fieldsForSelection);
      setValues({ ...defaultValuesForFields(fieldsForSelection), ...((carried?.values ?? {}) as Record<string, EntryFieldValue>) });
      setDuration(carried?.duration ?? "");
      setDueDate("");
    },
    [fieldsForSelection]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const pid = projectId || selectedProjectId;
      if (!pid) return;

      // Blank means "haven't spent any time on this yet" — not an error.
      const minutes = duration.trim() === "" ? 0 : parseInt(duration, 10);
      if (Number.isNaN(minutes) || minutes < 0) {
        setError("Time spent must be a number, 0 or more.");
        durationRef.current?.focus();
        return;
      }

      const missing = fieldsForSelection.find((f) => f.required && isEmptyValue(values[f.id]));
      if (missing) {
        setError(`"${missing.name}" is required.`);
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        const entryData: {
          durationMinutes: number;
          values: Record<string, EntryFieldValue>;
          dueDate?: string;
        } = {
          durationMinutes: minutes,
          values,
        };
        if (dueDate) entryData.dueDate = dueDate;

        const newEntry = await createEntry(pid, entryData);
        // The next quick entry in this project starts from this one.
        rememberProject(pid);
        rememberEntryDefaults(pid, fieldsForSelection, { durationMinutes: minutes, values });
        onSave(newEntry);
        resetFromLastEntry(pid);
        durationRef.current?.focus();
      } catch {
        setError("Couldn't save that entry. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, selectedProjectId, duration, dueDate, values, fieldsForSelection, onSave, resetFromLastEntry]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFieldChange = (fieldId: string, value: EntryFieldValue) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const inputClassName = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={compact ? "space-y-3" : "space-y-4"}
    >
      <div className="flex flex-wrap gap-3">
        {/* Project selector (hidden when projectId is preset) */}
        {!projectId && (
          <div className="w-52">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={inputClassName}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Duration */}
        <div className="w-32">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Minutes</label>
          <input
            ref={durationRef}
            type="number"
            min={0}
            placeholder="0 if not started"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={inputClassName}
          />
        </div>

        {/* Live stopwatch */}
        <div className="flex flex-col justify-end">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Stopwatch</label>
          <Stopwatch
            compact
            onMinutesChange={(mins) => setDuration(String(mins))}
          />
        </div>

        {/* Due date */}
        <div className="w-40">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClassName}
          />
        </div>

        {/* Dynamic fields */}
        {fieldsLoading ? (
          <div className="w-full flex items-center gap-2 text-xs text-slate-400 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading fields…
          </div>
        ) : (
          fieldsForSelection.map((field) => (
            <div
              key={field.id}
              className={
                field.type === "BOOLEAN"
                  ? "w-36 flex flex-col justify-end"
                  : field.type === "CHECKLIST" || field.type === "COMPUTED"
                    ? "w-full"
                    : "w-48"
              }
            >
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                {field.name}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.type === "TEXT" && (
                <input
                  type="text"
                  value={(values[field.id] as string) || ""}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className={inputClassName}
                />
              )}
              {field.type === "NUMBER" && (
                <input
                  type="number"
                  value={(values[field.id] as number | string) ?? ""}
                  onChange={(e) =>
                    handleFieldChange(field.id, e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={inputClassName}
                />
              )}
              {field.type === "DATE" && (
                <input
                  type="date"
                  value={(values[field.id] as string) || todayISO()}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className={inputClassName}
                />
              )}
              {field.type === "BOOLEAN" && (
                <label className="flex items-center gap-2 h-[38px] px-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!!values[field.id]}
                    onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-600">Yes</span>
                </label>
              )}
              {field.type === "TAGS" && (
                <input
                  type="text"
                  placeholder="Comma-separated"
                  value={Array.isArray(values[field.id]) ? (values[field.id] as string[]).join(", ") : ""}
                  onChange={(e) =>
                    handleFieldChange(
                      field.id,
                      e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean)
                    )
                  }
                  className={inputClassName}
                />
              )}
              {field.type === "CHECKLIST" && (
                <ChecklistInput
                  value={Array.isArray(values[field.id]) ? (values[field.id] as { label: string; checked: boolean }[]) : []}
                  onChange={(items) => handleFieldChange(field.id, items)}
                />
              )}
              {field.type === "LINK" && (
                <input
                  type="url"
                  placeholder="https://…"
                  value={(values[field.id] as string) || ""}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className={inputClassName}
                />
              )}
              {field.type === "REFERENCE" && (
                <ReferencePicker
                  projects={projects}
                  currentProjectId={projectId || selectedProjectId}
                  value={values[field.id] ?? null}
                  onChange={(v) => handleFieldChange(field.id, v)}
                  className={`${inputClassName} bg-white`}
                />
              )}
              {field.type === "COMPUTED" && (
                <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-sm font-medium text-slate-800">
                    {computedPreview[field.id] == null ? "—" : Number(computedPreview[field.id]!.toFixed(4))}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Calculated automatically from {formulaIdsToNames(field.formula ?? "", fieldsForSelection)}
                    {computedPreview[field.id] === null && " once those fields are filled in"}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {error && (
        <p className="text-xs font-medium text-red-600">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">Ctrl+Enter</kbd>{" "}
          to save
        </span>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
