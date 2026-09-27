import { useCallback, useEffect, useMemo, useState } from "react";
import { Zap, Pencil, Trash2 } from "lucide-react";
import Modal from "./Modal";
import {
  fetchAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  fetchEntryFields,
  fetchTags,
  type AutomationRule,
  type AutomationCondition,
  type AutomationAction,
  type AutomationOperator,
  type AutomationTrigger,
  type EntryField,
  type Tag,
} from "../api";

/**
 * US26 — the rule builder.
 *
 * Everything is a dropdown. The user never sees a field id, a tag id, an
 * operator code or any JSON: they pick a subject, and the operators offered are
 * the ones that subject admits.
 *
 * The operator table below mirrors utils/automationRules.ts on the server. The
 * server is authoritative and re-checks every rule — this copy exists so the UI
 * can avoid offering a combination that would only come back as a 400.
 */

const OPERATOR_LABELS: Record<AutomationOperator, string> = {
  EQ: "is",
  NEQ: "is not",
  GT: "is greater than",
  GTE: "is at least",
  LT: "is less than",
  LTE: "is at most",
  IS_EMPTY: "is empty",
  IS_NOT_EMPTY: "is not empty",
  IS_TRUE: "is true",
  IS_FALSE: "is false",
};

const NUMERIC_OPERATORS: AutomationOperator[] = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IS_EMPTY", "IS_NOT_EMPTY"];
const TEXT_OPERATORS: AutomationOperator[] = ["EQ", "NEQ", "IS_EMPTY", "IS_NOT_EMPTY"];
const BOOLEAN_OPERATORS: AutomationOperator[] = ["IS_TRUE", "IS_FALSE"];

const OPERATORS_BY_FIELD_TYPE: Record<string, AutomationOperator[]> = {
  NUMBER: NUMERIC_OPERATORS,
  COMPUTED: NUMERIC_OPERATORS,
  TEXT: TEXT_OPERATORS,
  LINK: TEXT_OPERATORS,
  BOOLEAN: BOOLEAN_OPERATORS,
};

const VALUELESS: AutomationOperator[] = ["IS_EMPTY", "IS_NOT_EMPTY", "IS_TRUE", "IS_FALSE"];

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  ENTRY_CREATED: "Entry is created",
  ENTRY_UPDATED: "Entry is updated",
};

/** One thing a condition can be written about: an entry attribute or a field. */
type Subject =
  | { kind: "ATTRIBUTE"; key: "durationMinutes" | "status"; label: string; operators: AutomationOperator[]; valueType: "number" | "status" }
  | { kind: "FIELD"; key: string; label: string; operators: AutomationOperator[]; valueType: "number" | "text" | "none" };

const ATTRIBUTE_SUBJECTS: Subject[] = [
  {
    kind: "ATTRIBUTE",
    key: "durationMinutes",
    label: "Duration (minutes)",
    // Duration is always present, so the presence operators do not apply.
    operators: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE"],
    valueType: "number",
  },
  { kind: "ATTRIBUTE", key: "status", label: "Status", operators: ["EQ", "NEQ"], valueType: "status" },
];

/** A row in the builder, before it becomes an AutomationCondition. */
type DraftCondition = { subjectKey: string; operator: AutomationOperator; value: string };

const BLANK_CONDITION: DraftCondition = { subjectKey: "durationMinutes", operator: "GT", value: "" };

type Draft = {
  name: string;
  trigger: AutomationTrigger;
  conditions: DraftCondition[];
  actionType: AutomationAction["type"];
  tagId: string;
  status: "OPEN" | "DONE";
};

const blankDraft = (): Draft => ({
  name: "",
  trigger: "ENTRY_CREATED",
  conditions: [{ ...BLANK_CONDITION }],
  actionType: "ADD_TAG",
  tagId: "",
  status: "DONE",
});

function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

export default function AutomationRules({ projectId }: { projectId: string }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AutomationRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [loadedRules, loadedFields, loadedTags] = await Promise.all([
        fetchAutomationRules(projectId),
        fetchEntryFields(projectId),
        fetchTags(),
      ]);
      setRules(loadedRules);
      setFields(loadedFields);
      setTags(loadedTags);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the automation rules."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Attributes first, then the project's fields whose type a rule can compare. */
  const subjects = useMemo<Subject[]>(() => {
    const fieldSubjects = fields
      .filter((field) => OPERATORS_BY_FIELD_TYPE[field.type] !== undefined)
      .map<Subject>((field) => ({
        kind: "FIELD",
        key: field.id,
        label: field.name,
        operators: OPERATORS_BY_FIELD_TYPE[field.type],
        valueType:
          field.type === "NUMBER" || field.type === "COMPUTED"
            ? "number"
            : field.type === "BOOLEAN"
              ? "none"
              : "text",
      }));
    return [...ATTRIBUTE_SUBJECTS, ...fieldSubjects];
  }, [fields]);

  const subjectFor = useCallback(
    (key: string) => subjects.find((subject) => subject.key === key) ?? subjects[0],
    [subjects]
  );

  const tagName = useCallback(
    (tagId: string) => tags.find((tag) => tag.id === tagId)?.name ?? "a deleted tag",
    [tags]
  );

  /** Render a stored condition as a sentence, resolving ids to current names. */
  const describeCondition = useCallback(
    (condition: AutomationCondition) => {
      const label =
        condition.source === "ATTRIBUTE"
          ? ATTRIBUTE_SUBJECTS.find((subject) => subject.key === condition.attribute)?.label ?? condition.attribute
          : fields.find((field) => field.id === condition.fieldId)?.name ?? "a field that no longer exists";
      const operator = OPERATOR_LABELS[condition.operator] ?? condition.operator;
      return condition.value === undefined ? `${label} ${operator}` : `${label} ${operator} ${condition.value}`;
    },
    [fields]
  );

  const describeAction = useCallback(
    (action: AutomationAction) => {
      if (action.type === "ADD_TAG") return `Add the tag "${tagName(action.tagId)}"`;
      if (action.type === "REMOVE_TAG") return `Remove the tag "${tagName(action.tagId)}"`;
      return `Mark the entry ${action.status === "DONE" ? "done" : "open"}`;
    },
    [tagName]
  );

  const openNew = () => {
    setEditing(null);
    // No tag is pre-selected on purpose. Defaulting to whichever tag happens
    // to be first would let someone create a rule that silently applies a tag
    // they never chose.
    setDraft(blankDraft());
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditing(rule);
    setDraft({
      name: rule.name,
      trigger: rule.trigger,
      conditions: rule.conditions.map((condition) => ({
        subjectKey: condition.source === "ATTRIBUTE" ? condition.attribute : condition.fieldId,
        operator: condition.operator,
        value: condition.value === undefined ? "" : String(condition.value),
      })),
      actionType: rule.action.type,
      tagId: rule.action.type === "SET_STATUS" ? "" : rule.action.tagId,
      status: rule.action.type === "SET_STATUS" ? rule.action.status : "DONE",
    });
    setFormError("");
    setShowForm(true);
  };

  /** Turn the draft into the request body, or explain why it is not ready. */
  const buildInput = (): { name: string; trigger: AutomationTrigger; conditions: AutomationCondition[]; action: AutomationAction } | string => {
    if (!draft.name.trim()) return "Give the rule a name.";

    const conditions: AutomationCondition[] = [];
    for (const row of draft.conditions) {
      const subject = subjectFor(row.subjectKey);
      if (!subject) return "Choose what the condition is about.";

      const needsValue = !VALUELESS.includes(row.operator);
      let value: number | string | undefined;

      if (needsValue) {
        if (row.value.trim() === "") return "Fill in a value for every condition.";
        if (subject.valueType === "number") {
          const parsed = Number(row.value);
          if (!Number.isFinite(parsed)) return "That condition needs a number.";
          value = parsed;
        } else {
          value = row.value.trim();
        }
      }

      conditions.push(
        subject.kind === "ATTRIBUTE"
          ? { source: "ATTRIBUTE", attribute: subject.key, operator: row.operator, ...(value !== undefined && { value }) }
          : { source: "FIELD", fieldId: subject.key, operator: row.operator, ...(value !== undefined && { value }) }
      );
    }

    if (conditions.length === 0) return "Add at least one condition.";

    let action: AutomationAction;
    if (draft.actionType === "SET_STATUS") {
      action = { type: "SET_STATUS", status: draft.status };
    } else {
      if (!draft.tagId) return "Choose a tag for the action.";
      action = { type: draft.actionType, tagId: draft.tagId };
    }

    return { name: draft.name.trim(), trigger: draft.trigger, conditions, action };
  };

  const save = async () => {
    const built = buildInput();
    if (typeof built === "string") {
      setFormError(built);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      if (editing) await updateAutomationRule(projectId, editing.id, built);
      else await createAutomationRule(projectId, built);
      setShowForm(false);
      await load();
    } catch (error) {
      setFormError(errorMessage(error, "Could not save the rule."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: AutomationRule) => {
    try {
      await updateAutomationRule(projectId, rule.id, { enabled: !rule.enabled });
      await load();
    } catch (error) {
      setLoadError(errorMessage(error, "Could not change the rule."));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAutomationRule(projectId, confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (error) {
      setLoadError(errorMessage(error, "Could not delete the rule."));
    }
  };

  const updateCondition = (index: number, patch: Partial<DraftCondition>) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Automation Rules</h2>
        </div>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
        >
          New Rule
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Have the logbook fill things in for you. A rule watches for an entry being saved, checks
        what you tell it to, and tags or completes the entry itself.
      </p>

      {loadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{loadError}</p>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading rules…</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-slate-400">
          No rules yet. A first one might tag any entry longer than four hours.
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{rule.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">When: {TRIGGER_LABELS[rule.trigger]}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      rule.enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    onClick={() => openEdit(rule)}
                    aria-label={`Edit ${rule.name}`}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(rule)}
                    aria-label={`Delete ${rule.name}`}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <dl className="mt-2 text-xs text-slate-600 space-y-0.5">
                <div className="flex gap-2">
                  <dt className="font-medium text-slate-500 w-10 shrink-0">If</dt>
                  <dd>
                    {rule.conditions.map(describeCondition).join(" and ")}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-slate-500 w-10 shrink-0">Then</dt>
                  <dd>{describeAction(rule.action)}</dd>
                </div>
              </dl>

              {rule.invalidReason && (
                <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  This rule is not running: {rule.invalidReason}
                </p>
              )}

              <button
                onClick={() => void toggle(rule)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                {rule.enabled ? "Disable" : "Enable"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit rule" : "New rule"}>
        <div className="space-y-4">
          <div>
            <label htmlFor="rule-name" className="block text-xs font-medium text-slate-600 mb-1">
              Name
            </label>
            <input
              id="rule-name"
              value={draft.name}
              onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
              placeholder="Tag long sessions"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="rule-trigger" className="block text-xs font-medium text-slate-600 mb-1">
              When
            </label>
            <select
              id="rule-trigger"
              value={draft.trigger}
              onChange={(e) => setDraft((current) => ({ ...current, trigger: e.target.value as AutomationTrigger }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">If</span>
            <div className="space-y-2">
              {draft.conditions.map((row, index) => {
                const subject = subjectFor(row.subjectKey);
                const needsValue = !VALUELESS.includes(row.operator);
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Condition ${index + 1} subject`}
                      value={row.subjectKey}
                      onChange={(e) => {
                        const next = subjectFor(e.target.value);
                        updateCondition(index, {
                          subjectKey: e.target.value,
                          // The previous operator may not apply to the new subject.
                          operator: next.operators.includes(row.operator) ? row.operator : next.operators[0],
                          value: "",
                        });
                      }}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {subjects.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>

                    <select
                      aria-label={`Condition ${index + 1} operator`}
                      value={row.operator}
                      onChange={(e) => updateCondition(index, { operator: e.target.value as AutomationOperator })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {subject?.operators.map((operator) => (
                        <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>
                      ))}
                    </select>

                    {needsValue && subject?.valueType === "status" ? (
                      <select
                        aria-label={`Condition ${index + 1} value`}
                        value={row.value || "DONE"}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="OPEN">Open</option>
                        <option value="DONE">Done</option>
                      </select>
                    ) : needsValue ? (
                      <input
                        aria-label={`Condition ${index + 1} value`}
                        value={row.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        inputMode={subject?.valueType === "number" ? "decimal" : "text"}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-28"
                      />
                    ) : null}

                    {draft.conditions.length > 1 && (
                      <button
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            conditions: current.conditions.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={`Remove condition ${index + 1}`}
                        className="text-xs text-slate-400 hover:text-red-600 transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() =>
                setDraft((current) => ({ ...current, conditions: [...current.conditions, { ...BLANK_CONDITION }] }))
              }
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Add condition
            </button>
            <p className="text-[11px] text-slate-400 mt-1">Every condition has to hold for the rule to act.</p>
          </div>

          <div>
            <label htmlFor="rule-action" className="block text-xs font-medium text-slate-600 mb-1">
              Then
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="rule-action"
                value={draft.actionType}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, actionType: e.target.value as AutomationAction["type"] }))
                }
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="ADD_TAG">Add tag</option>
                <option value="REMOVE_TAG">Remove tag</option>
                <option value="SET_STATUS">Set status</option>
              </select>

              {draft.actionType === "SET_STATUS" ? (
                <select
                  aria-label="Action status"
                  value={draft.status}
                  onChange={(e) => setDraft((current) => ({ ...current, status: e.target.value as "OPEN" | "DONE" }))}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="DONE">Done</option>
                  <option value="OPEN">Open</option>
                </select>
              ) : tags.length === 0 ? (
                <span className="text-xs text-slate-400">Tag an entry first to create a tag to use here.</span>
              ) : (
                <select
                  aria-label="Action tag"
                  value={draft.tagId}
                  onChange={(e) => setDraft((current) => ({ ...current, tagId: e.target.value }))}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a tag…</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Create rule"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete rule">
        <p className="text-sm text-slate-600 mb-4">
          Delete “{confirmDelete?.name}”? Entries it has already changed keep those changes.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void remove()}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Delete rule
          </button>
          <button
            onClick={() => setConfirmDelete(null)}
            className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
