import { z } from "zod";

/**
 * US26 — the wire shape of an automation rule.
 *
 * This file is the outer of two validation layers. It settles what a rule
 * *looks* like: which triggers exist, which operators exist, whether an
 * operator that needs a comparison value was given one. It cannot settle
 * whether a fieldId belongs to the project, or whether GT makes sense for a
 * TEXT field, because those questions need the project's fields — the service
 * answers them (see validateRuleAgainstProject in utils/automationRules.ts).
 *
 * The split mirrors US17, where Zod checks the statistic's shape and the US16
 * parser checks the expression itself.
 */

export const AUTOMATION_TRIGGERS = ["ENTRY_CREATED", "ENTRY_UPDATED"] as const;

/**
 * Operators that compare against a value, and operators that ask about a
 * value's presence or truth and therefore take none. Keeping the two sets
 * named separately is what lets the refinement below reject
 * `{ operator: "IS_EMPTY", value: 4 }` rather than quietly ignoring the 4.
 */
export const COMPARISON_OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE"] as const;
export const UNARY_OPERATORS = ["IS_EMPTY", "IS_NOT_EMPTY", "IS_TRUE", "IS_FALSE"] as const;
export const ALL_OPERATORS = [...COMPARISON_OPERATORS, ...UNARY_OPERATORS] as const;

/** Numeric operators, for the field-type check the service performs. */
export const ORDERING_OPERATORS = ["GT", "GTE", "LT", "LTE"] as const;

/**
 * The entry's own columns a rule may read. Deliberately two.
 *
 * durationMinutes and status are what the story's own examples reach for, and
 * both are plain scalar columns. dueDate and entryDate are left out on
 * purpose: they are nullable timestamps whose comparison semantics (timezone,
 * date-only versus instant) are not settled anywhere in the product, and a
 * rule that silently compared them wrongly would be worse than no rule.
 */
export const ENTRY_ATTRIBUTES = ["durationMinutes", "status"] as const;

export const ENTRY_STATUSES = ["OPEN", "DONE"] as const;

const operator = z.enum(ALL_OPERATORS);

/** A comparison value. Narrowed per attribute and per field type further in. */
const conditionValue = z.union([z.number(), z.string(), z.boolean()]);

const attributeCondition = z.object({
  source: z.literal("ATTRIBUTE"),
  attribute: z.enum(ENTRY_ATTRIBUTES),
  operator,
  value: conditionValue.optional(),
});

const fieldCondition = z.object({
  source: z.literal("FIELD"),
  fieldId: z.string().uuid("Choose a field"),
  operator,
  value: conditionValue.optional(),
});

const condition = z
  .discriminatedUnion("source", [attributeCondition, fieldCondition])
  .superRefine((value, ctx) => {
    const needsValue = (COMPARISON_OPERATORS as readonly string[]).includes(value.operator);

    if (needsValue && value.value === undefined) {
      ctx.addIssue({ code: "custom", message: "That comparison needs a value" });
      return;
    }
    if (!needsValue && value.value !== undefined) {
      ctx.addIssue({ code: "custom", message: "That condition does not take a value" });
      return;
    }

    if (value.source !== "ATTRIBUTE") return;

    // The two entry attributes have fixed types, so unlike a custom field they
    // can be checked here without consulting the database.
    if (value.attribute === "durationMinutes") {
      if (value.value !== undefined && typeof value.value !== "number") {
        ctx.addIssue({ code: "custom", message: "Duration must be compared with a number" });
      }
      if (!needsValue) {
        ctx.addIssue({ code: "custom", message: "Duration is always set, so that condition does not apply" });
      }
      return;
    }

    // status
    if (value.operator !== "EQ" && value.operator !== "NEQ") {
      ctx.addIssue({ code: "custom", message: "Status can only be compared with is or is not" });
      return;
    }
    if (!(ENTRY_STATUSES as readonly unknown[]).includes(value.value)) {
      ctx.addIssue({ code: "custom", message: "Status must be OPEN or DONE" });
    }
  });

/**
 * Actions are limited to relationships and columns the app already mutates
 * through ordinary editing: a tag on the entry, and its status. There is
 * deliberately no action that writes a field value (it would collide with
 * COMPUTED fields and the required-field rules), none that sets a date, and
 * none that creates an entry — that last one would turn every rule into a
 * potential source of unbounded entries and would interact badly with offline
 * replay. See the limitations note in docs.
 */
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_TAG"), tagId: z.string().uuid("Choose a tag") }),
  z.object({ type: z.literal("REMOVE_TAG"), tagId: z.string().uuid("Choose a tag") }),
  z.object({ type: z.literal("SET_STATUS"), status: z.enum(ENTRY_STATUSES) }),
]);

const name = z
  .string()
  .max(100, "That name is too long")
  .refine((value) => value.trim().length > 0, "Give the rule a name")
  .transform((value) => value.trim());

/**
 * At least one condition is required. A rule with none would fire on every
 * single save, which is never what someone means and is the easiest way to
 * make the feature feel broken.
 *
 * The upper bound is not a performance limit — evaluation is in-memory over an
 * entry already loaded — but a guard on how much a single stored row can carry.
 */
const conditions = z
  .array(condition)
  .min(1, "Add at least one condition")
  .max(10, "That is too many conditions for one rule");

export const createAutomationRuleSchema = z.object({
  name,
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions,
  action,
  enabled: z.boolean().optional().default(true),
});

/** An edit may change any part, but has to change something. */
export const updateAutomationRuleSchema = z
  .object({
    name: name.optional(),
    trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
    conditions: conditions.optional(),
    action: action.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Change something about the rule"
  );

export type AutomationConditionInput = z.infer<typeof condition>;
export type AutomationActionInput = z.infer<typeof action>;
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;
