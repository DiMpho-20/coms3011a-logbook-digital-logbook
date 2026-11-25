import { Check, Loader2 } from "lucide-react";

import type { EntryField, RecurrencePattern } from "../../api";
import { todayISO } from "../../lib/utils";
import { isSaveShortcut } from "../../lib/quickCapture";
import { formulaIdsToNames } from "../../lib/formulas";
import Modal from "../../components/Modal";
import Stopwatch from "../../components/Stopwatch";
import ReferencePicker from "../../components/ReferencePicker";
import TagInput from "../../components/TagInput";
import ChecklistInput from "../../components/ChecklistInput";
import type { EntryForm } from "./useEntryForm";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

/**
 * The new/edit entry dialog: the project's own fields in the order the
 * project defines them, then the things every entry has — date, time,
 * tags, due date, repetition.
 *
 * The form's state lives in `useEntryForm`; this file is only the shape of
 * the questions, so what is asked and what is done with the answers can be
 * read apart.
 */
export default function EntryFormModal({
  form,
  projectId,
  fields,
}: {
  form: EntryForm;
  projectId: string | undefined;
  fields: EntryField[];
}) {
  return (
    <Modal open={form.open} onClose={form.close} title={form.editingEntry ? "Edit Entry" : "New Entry"}>
      <div
        ref={form.formRef}
        className="space-y-4"
        onKeyDown={(e) => {
          if (!isSaveShortcut(e)) return;
          e.preventDefault();
          if (!form.entrySubmitting) void form.submit();
        }}
      >
        {!form.editingEntry && form.entryPrefilled && (
          <p className="text-xs text-slate-500">Filled in from your last entry in this project. Change anything that's different.</p>
        )}
        {form.entryError && (
          <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {form.entryError}
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
                    value={(form.entryValues[field.id] as string) || ""}
                    onChange={(e) => form.handleFieldChange(field.id, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                )}
                {field.type === "NUMBER" && (
                  <input
                    type="number"
                    value={(form.entryValues[field.id] as number | string) ?? ""}
                    onChange={(e) =>
                      form.handleFieldChange(field.id, e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className={inputCls}
                  />
                )}
                {field.type === "DATE" && (
                  <input
                    type="date"
                    value={(form.entryValues[field.id] as string) || todayISO()}
                    onChange={(e) => form.handleFieldChange(field.id, e.target.value)}
                    className={inputCls}
                  />
                )}
                {field.type === "BOOLEAN" && (
                  <label className="flex items-center gap-2 h-[38px] px-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={!!form.entryValues[field.id]}
                      onChange={(e) => form.handleFieldChange(field.id, e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-600">Yes</span>
                  </label>
                )}
                {field.type === "TAGS" && (
                  <input type="text" placeholder="Comma-separated tags" value={Array.isArray(form.entryValues[field.id]) ? (form.entryValues[field.id] as string[]).join(", ") : ""}
                    onChange={(e) => form.handleFieldChange(field.id, e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
                    className={inputCls} />
                )}
                {field.type === "CHECKLIST" && (
                  <ChecklistInput
                    value={Array.isArray(form.entryValues[field.id]) ? (form.entryValues[field.id] as { label: string; checked: boolean }[]) : []}
                    onChange={(items) => form.handleFieldChange(field.id, items)}
                  />
                )}
                {field.type === "LINK" && (
                  <input type="url" placeholder="https://…" value={(form.entryValues[field.id] as string) || ""} onChange={(e) => form.handleFieldChange(field.id, e.target.value)} className={inputCls} />
                )}
                {field.type === "REFERENCE" && (
                  <ReferencePicker
                    projects={form.allProjects}
                    currentProjectId={projectId}
                    excludeEntryId={form.editingEntry?.id}
                    value={form.entryValues[field.id] ?? null}
                    onChange={(v) => form.handleFieldChange(field.id, v)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white"
                  />
                )}
                {field.type === "COMPUTED" && (
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-sm font-medium text-slate-800">
                      {form.computedPreview[field.id] == null ? "—" : Number(form.computedPreview[field.id]!.toFixed(4))}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Calculated automatically from {formulaIdsToNames(field.formula ?? "", fields)}
                      {form.computedPreview[field.id] === null && " once those fields are filled in"}
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
              value={form.entryDate}
              onChange={(e) => form.setEntryDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Time spent (minutes, optional)</label>
            <input
              type="number"
              min={0}
              placeholder="Leave blank if not started"
              value={form.entryDuration}
              onChange={(e) => form.setEntryDuration(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Live stopwatch */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Stopwatch</label>
          <Stopwatch
            compact
            onMinutesChange={(mins) => form.setEntryDuration(String(mins))}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Tags</label>
          <TagInput ref={form.tagInputRef} value={form.entryTags} onChange={form.setEntryTags} suggestions={form.tagSuggestions} placeholder="e.g. urgent, research" />
        </div>

        {/* Due date */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Due date</label>
          <input
            type="date"
            value={form.entryDueDate}
            onChange={(e) => form.setEntryDueDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {!form.editingEntry && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.entryRecurring}
                onChange={(e) => form.setEntryRecurring(e.target.checked)}
                className="rounded"
              />
              Repeat this entry automatically
            </label>
            {form.entryRecurring && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-slate-600" htmlFor="recurrence-pattern">Repeat</label>
                <select
                  id="recurrence-pattern"
                  value={form.recurrencePattern}
                  onChange={(e) => form.setRecurrencePattern(e.target.value as RecurrencePattern)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <span className="mr-auto text-[11px] text-slate-400">Ctrl+Enter to save</span>
          <button
            type="button"
            onClick={form.close}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={form.submit}
            disabled={form.entrySubmitting}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
          >
            {form.entrySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {form.editingEntry ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
