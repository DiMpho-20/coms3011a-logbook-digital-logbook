import {
  COMPARISON_OPERATORS,
  ORDERING_OPERATORS,
  type AutomationActionInput,
  type AutomationConditionInput,
} from "../schemas/automationRule.schema.js";

/**
 * US26 — the rule evaluator.
 *
 * Deliberately pure: no Prisma, no Express, no clock. Everything it needs
 * arrives in a context object, which is what makes the whole decision path
 * testable without a database and keeps the interesting logic out of the
 * controller.
 *
 * A rule is data. Nothing in this file interprets a stored string as code:
 * there is no eval, no Function, no template compilation, no SQL built from
 * user input. A condition is a tagged record and the switch statements below
 * are the only things that give it meaning.
 */

export type AutomationCondition = AutomationConditionInput;
export type AutomationAction = AutomationActionInput;

/** The project's live fields, as evaluation and validation need to see them. */
export type RuleField = { id: string; name: string; type: string };

export type RuleEvaluationContext = {
  durationMinutes: number;
  status: string;
  /**
   * fieldId -> the stored string. A field the entry never filled in has no
   * EntryValue row at all (see createEntry's isEmptyValue filter), so absence
   * here is meaningful rather than an oversight: it is what IS_EMPTY tests.
   */
  values: Map<string, string>;
  /** fieldId -> type, for the project's non-archived fields only. */
  fieldTypes: Map<string, string>;
};

/**
 * Which operators each field type admits.
 *
 * The omissions are the point. DATE is absent because an EntryValue holds
 * whatever ISO-ish string passed Date.parse, so two dates that denote the same
 * day can compare unequal and a date-only value has no defined instant — the
 * story does not need date rules, and a wrong one would be worse than none.
 * TAGS, CHECKLIST and REFERENCE are absent because their values are JSON
 * documents; comparing them with EQ would be comparing serializations.
 */
const OPERATORS_BY_FIELD_TYPE: Record<string, readonly string[]> = {
  NUMBER: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IS_EMPTY", "IS_NOT_EMPTY"],
  // A COMPUTED field's value is produced by the formula engine but stored and
  // read exactly like a NUMBER, so it takes the same operators.
  COMPUTED: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IS_EMPTY", "IS_NOT_EMPTY"],
  TEXT: ["EQ", "NEQ", "IS_EMPTY", "IS_NOT_EMPTY"],
  LINK: ["EQ", "NEQ", "IS_EMPTY", "IS_NOT_EMPTY"],
  BOOLEAN: ["IS_TRUE", "IS_FALSE"],
  DATE: [],
  TAGS: [],
  CHECKLIST: [],
  REFERENCE: [],
};

/** The operators a rule may use against a field of this type; empty means unsupported. */
export function operatorsForFieldType(type: string): readonly string[] {
  return OPERATORS_BY_FIELD_TYPE[type] ?? [];
}

/** Field types a condition can be written against at all. */
export function isConditionableFieldType(type: string): boolean {
  return operatorsForFieldType(type).length > 0;
}

/**
 * The same strictness the statistics queries use (BUG-012): a value counts as
 * numeric only if it is entirely a number. "12kg" and "" are not 12 and not 0.
 * No coercion — an unparseable value makes the condition false rather than
 * quietly comparing NaN.
 */
const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/;

function asNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return NUMERIC.test(trimmed) ? Number(trimmed) : null;
}

function isBlank(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === "";
}

/**
 * Text comparison folds case and surrounding whitespace. " Done " and "done"
 * are the same answer to "does this field say done", and the alternative —
 * exact bytes — makes rules fail for reasons the user cannot see on screen.
 * Consistent with cleanTagNames, which already dedupes tags case-insensitively.
 */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function compareNumbers(operator: string, left: number, right: number): boolean {
  switch (operator) {
    case "EQ": return left === right;
    case "NEQ": return left !== right;
    case "GT": return left > right;
    case "GTE": return left >= right;
    case "LT": return left < right;
    case "LTE": return left <= right;
    default: return false;
  }
}

/**
 * Evaluate one condition. Returns false for anything it cannot answer — an
 * unknown field, an operator the field type does not admit, a value that is
 * not the shape the operator needs. Failing closed matters: the alternative is
 * an automation that mutates an entry on the strength of a comparison it did
 * not actually perform.
 */
function evaluateCondition(condition: AutomationCondition, ctx: RuleEvaluationContext): boolean {
  if (condition.source === "ATTRIBUTE") {
    if (condition.attribute === "durationMinutes") {
      return typeof condition.value === "number"
        ? compareNumbers(condition.operator, ctx.durationMinutes, condition.value)
        : false;
    }
    // status
    if (typeof condition.value !== "string") return false;
    if (condition.operator === "EQ") return ctx.status === condition.value;
    if (condition.operator === "NEQ") return ctx.status !== condition.value;
    return false;
  }

  const type = ctx.fieldTypes.get(condition.fieldId);
  // Archived, deleted, or belonging to another project: not evaluable.
  if (type === undefined) return false;
  if (!operatorsForFieldType(type).includes(condition.operator)) return false;

  const raw = ctx.values.get(condition.fieldId);

  switch (condition.operator) {
    case "IS_EMPTY":
      return isBlank(raw);
    case "IS_NOT_EMPTY":
      return !isBlank(raw);
    case "IS_TRUE":
      return raw?.trim().toLowerCase() === "true";
    case "IS_FALSE":
      return raw?.trim().toLowerCase() === "false";
    default:
      break;
  }

  // A comparison against a value the entry does not have is false, for every
  // operator — including NEQ. "notes is not X" should not hold for an entry
  // with no notes; IS_EMPTY is how you ask that question.
  if (raw === undefined) return false;

  if (type === "NUMBER" || type === "COMPUTED") {
    const left = asNumber(raw);
    const right = typeof condition.value === "number" ? condition.value : asNumber(String(condition.value));
    if (left === null || right === null) return false;
    return compareNumbers(condition.operator, left, right);
  }

  // TEXT and LINK: equality only, already enforced above.
  if (typeof condition.value !== "string") return false;
  const equal = sameText(raw, condition.value);
  return condition.operator === "EQ" ? equal : !equal;
}

/**
 * All conditions must hold — AND only.
 *
 * There is no OR and no nesting. The story asks for "a rule condition is
 * satisfied", and a flat AND list is the largest language that stays
 * explainable in a dropdown UI. Two behaviours that need OR are two rules.
 */
export function evaluateConditions(
  conditions: AutomationCondition[],
  ctx: RuleEvaluationContext
): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((condition) => evaluateCondition(condition, ctx));
}

/**
 * Why a stored rule cannot run, or null when it can.
 *
 * Called both when a rule is written (so a bad rule is refused with a 400) and
 * before it is run (so a rule whose field was archived after it was saved
 * stops rather than acting on a guess). Field identity is by id throughout —
 * never by name, which is exactly the ambiguity US16 hit when a project had
 * two fields called "Double hours".
 */
export function describeRuleProblem(
  conditions: AutomationCondition[],
  action: AutomationAction,
  context: { fields: RuleField[]; tagIds: Set<string> }
): string | null {
  const byId = new Map(context.fields.map((field) => [field.id, field]));

  for (const condition of conditions) {
    if (condition.source === "ATTRIBUTE") continue;

    const field = byId.get(condition.fieldId);
    if (!field) {
      return "A field this rule uses is no longer available.";
    }
    if (!isConditionableFieldType(field.type)) {
      return `"${field.name}" is a ${field.type.toLowerCase()} field, which rules cannot compare.`;
    }
    const allowed = operatorsForFieldType(field.type);
    if (!allowed.includes(condition.operator)) {
      const ordering = (ORDERING_OPERATORS as readonly string[]).includes(condition.operator);
      return ordering
        ? `"${field.name}" holds ${field.type === "TEXT" ? "text" : "values"} that cannot be ordered, so it cannot be compared with greater or less than.`
        : `That comparison does not apply to "${field.name}".`;
    }
    if (
      (COMPARISON_OPERATORS as readonly string[]).includes(condition.operator) &&
      (field.type === "NUMBER" || field.type === "COMPUTED") &&
      typeof condition.value !== "number"
    ) {
      return `"${field.name}" must be compared with a number.`;
    }
    if (
      (COMPARISON_OPERATORS as readonly string[]).includes(condition.operator) &&
      (field.type === "TEXT" || field.type === "LINK") &&
      typeof condition.value !== "string"
    ) {
      return `"${field.name}" must be compared with text.`;
    }
  }

  if (action.type === "ADD_TAG" || action.type === "REMOVE_TAG") {
    if (!context.tagIds.has(action.tagId)) {
      return "The tag this rule uses is no longer available.";
    }
  }

  return null;
}
