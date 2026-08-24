import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Check } from "lucide-react";
import Stopwatch from "./Stopwatch";
import { todayISO, defaultValuesForFields, isEmptyValue } from "../lib/utils";
import { createEntry, type Project, type EntryField, type EntryFieldValue } from "../api";

interface EntryFormProps {
  projects: Project[];
  /** Pre-selected project ID; if set, the project selector is hidden. */
  projectId?: string;
  /** Fields for the selected project. */
  fields: EntryField[];
  /** Called after successful save. */
  onSave: (entry: unknown) => void;
  /** Label for submit button. */
  submitLabel?: string;
  compact?: boolean;
}

export default function EntryForm({
  projects,
  projectId,
  fields,
  onSave,
  submitLabel = "Save Entry",
  compact = false,
}: EntryFormProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || projects[0]?.id || "");
  const [duration, setDuration] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [values, setValues] = useState<Record<string, EntryFieldValue>>(
    defaultValuesForFields(fields)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form when fields change
  useEffect(() => {
    setValues(defaultValuesForFields(fields));
    setDuration("");
    setDueDate("");
    setError(null);
  }, [fields]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const pid = projectId || selectedProjectId;
      if (!pid) return;

      const minutes = parseInt(duration, 10);
      if (!minutes || minutes <= 0) {
        setError("Enter how long this took, in minutes.");
        durationRef.current?.focus();
        return;
      }

      const missing = fields.find((f) => f.required && isEmptyValue(values[f.id]));
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
        onSave(newEntry);
        setValues(defaultValuesForFields(fields));
        setDuration("");
        setDueDate("");
        durationRef.current?.focus();
      } catch {
        setError("Couldn't save that entry. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, selectedProjectId, duration, dueDate, values, fields, onSave]
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
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            min={1}
            placeholder="e.g. 45"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Dynamic fields */}
        {fields.map((field) => (
          <div
            key={field.id}
            className={field.type === "BOOLEAN" ? "w-36 flex flex-col justify-end" : "w-48"}
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
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
            {field.type === "NUMBER" && (
              <input
                type="number"
                value={(values[field.id] as number | string) ?? ""}
                onChange={(e) =>
                  handleFieldChange(field.id, e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
            {field.type === "DATE" && (
              <input
                type="date"
                value={(values[field.id] as string) || todayISO()}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          </div>
        ))}
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
