import { describe, it, expect } from "vitest";
import {
  evaluateConditions,
  describeRuleProblem,
  operatorsForFieldType,
  isConditionableFieldType,
  type AutomationCondition,
  type RuleEvaluationContext,
} from "../utils/automationRules.js";

// US26's rule language, tested without a database. The evaluator is pure by
// design, so every decision the automation makes can be pinned down here and
// the integration suite can concentrate on persistence and ownership.

const NUMBER_FIELD = "11111111-1111-1111-1111-111111111111";
const TEXT_FIELD = "22222222-2222-2222-2222-222222222222";
const BOOLEAN_FIELD = "33333333-3333-3333-3333-333333333333";
const DATE_FIELD = "44444444-4444-4444-4444-444444444444";
const ARCHIVED_FIELD = "99999999-9999-9999-9999-999999999999";
const TAG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** An entry: 5 hours logged, 6 in the Hours field, notes "Deep Work", flag true. */
const context = (over: Partial<RuleEvaluationContext> = {}): RuleEvaluationContext => ({
  durationMinutes: 300,
  status: "OPEN",
  values: new Map([
    [NUMBER_FIELD, "6"],
    [TEXT_FIELD, "Deep Work"],
    [BOOLEAN_FIELD, "true"],
  ]),
  fieldTypes: new Map([
    [NUMBER_FIELD, "NUMBER"],
    [TEXT_FIELD, "TEXT"],
    [BOOLEAN_FIELD, "BOOLEAN"],
    [DATE_FIELD, "DATE"],
  ]),
  ...over,
});

const holds = (condition: AutomationCondition, ctx = context()) =>
  evaluateConditions([condition], ctx);

const numeric = (operator: string, value: number): AutomationCondition =>
  ({ source: "FIELD", fieldId: NUMBER_FIELD, operator, value }) as AutomationCondition;

const attribute = (attr: string, operator: string, value: unknown): AutomationCondition =>
  ({ source: "ATTRIBUTE", attribute: attr, operator, value }) as AutomationCondition;

describe("conditions on the entry's own attributes", () => {
  it("compares duration with every ordering operator", () => {
    expect(holds(attribute("durationMinutes", "GT", 240))).toBe(true);
    expect(holds(attribute("durationMinutes", "GT", 400))).toBe(false);
    expect(holds(attribute("durationMinutes", "GTE", 300))).toBe(true);
    expect(holds(attribute("durationMinutes", "LT", 301))).toBe(true);
    expect(holds(attribute("durationMinutes", "LT", 300))).toBe(false);
    expect(holds(attribute("durationMinutes", "LTE", 300))).toBe(true);
  });

  it("compares duration for equality", () => {
    expect(holds(attribute("durationMinutes", "EQ", 300))).toBe(true);
    expect(holds(attribute("durationMinutes", "EQ", 299))).toBe(false);
    expect(holds(attribute("durationMinutes", "NEQ", 299))).toBe(true);
  });

  it("compares status", () => {
    expect(holds(attribute("status", "EQ", "OPEN"))).toBe(true);
    expect(holds(attribute("status", "EQ", "DONE"))).toBe(false);
    expect(holds(attribute("status", "NEQ", "DONE"))).toBe(true);
    expect(holds(attribute("status", "EQ", "DONE"), context({ status: "DONE" }))).toBe(true);
  });

  it("refuses a duration comparison whose value is not a number", () => {
    expect(holds(attribute("durationMinutes", "GT", "four"))).toBe(false);
  });
});

describe("conditions on custom fields", () => {
  it("orders and compares a NUMBER field", () => {
    expect(holds(numeric("GT", 4))).toBe(true);
    expect(holds(numeric("GT", 8))).toBe(false);
    expect(holds(numeric("GTE", 6))).toBe(true);
    expect(holds(numeric("LT", 7))).toBe(true);
    expect(holds(numeric("LTE", 6))).toBe(true);
    expect(holds(numeric("EQ", 6))).toBe(true);
    expect(holds(numeric("NEQ", 5))).toBe(true);
  });

  it("handles decimals and negatives", () => {
    const ctx = context({ values: new Map([[NUMBER_FIELD, "5.75"]]) });
    expect(holds(numeric("GT", 5.5), ctx)).toBe(true);
    expect(holds(numeric("LT", 5.5), ctx)).toBe(false);

    const negative = context({ values: new Map([[NUMBER_FIELD, "-3"]]) });
    expect(holds(numeric("LT", 0), negative)).toBe(true);
  });

  it("never coerces a non-numeric value into a number", () => {
    // The whole point of the BUG-012 guard: "12kg" is not 12, and a blank
    // value is not zero. An unparseable comparison is false, not a guess.
    const messy = context({ values: new Map([[NUMBER_FIELD, "12kg"]]) });
    expect(holds(numeric("GT", 4), messy)).toBe(false);

    const blank = context({ values: new Map([[NUMBER_FIELD, ""]]) });
    expect(holds(numeric("LT", 1), blank)).toBe(false);
  });

  it("compares TEXT for equality, folding case and surrounding space", () => {
    const text = (operator: string, value: string): AutomationCondition =>
      ({ source: "FIELD", fieldId: TEXT_FIELD, operator, value }) as AutomationCondition;

    expect(holds(text("EQ", "Deep Work"))).toBe(true);
    expect(holds(text("EQ", "deep work"))).toBe(true);
    expect(holds(text("EQ", "  Deep Work  "))).toBe(true);
    expect(holds(text("EQ", "Shallow"))).toBe(false);
    expect(holds(text("NEQ", "Shallow"))).toBe(true);
  });

  it("refuses to order a TEXT field", () => {
    // "notes > 5" is the case the brief calls out explicitly.
    expect(holds({ source: "FIELD", fieldId: TEXT_FIELD, operator: "GT", value: 5 } as AutomationCondition)).toBe(false);
  });

  it("asks whether a BOOLEAN field is true or false", () => {
    const bool = (operator: string): AutomationCondition =>
      ({ source: "FIELD", fieldId: BOOLEAN_FIELD, operator }) as AutomationCondition;

    expect(holds(bool("IS_TRUE"))).toBe(true);
    expect(holds(bool("IS_FALSE"))).toBe(false);
    expect(holds(bool("IS_FALSE"), context({ values: new Map([[BOOLEAN_FIELD, "false"]]) }))).toBe(true);
  });

  it("tests presence, treating a missing row and a blank alike", () => {
    const presence = (fieldId: string, operator: string): AutomationCondition =>
      ({ source: "FIELD", fieldId, operator }) as AutomationCondition;

    expect(holds(presence(TEXT_FIELD, "IS_NOT_EMPTY"))).toBe(true);
    // An entry that never filled the field in has no EntryValue row at all.
    expect(holds(presence(NUMBER_FIELD, "IS_EMPTY"), context({ values: new Map() }))).toBe(true);
    expect(holds(presence(TEXT_FIELD, "IS_EMPTY"), context({ values: new Map([[TEXT_FIELD, "   "]]) }))).toBe(true);
  });

  it("does not let NEQ hold for a value the entry does not have", () => {
    // Otherwise "notes is not X" would be true of every entry with no notes,
    // which is almost never what someone means. IS_EMPTY asks that question.
    const ctx = context({ values: new Map() });
    expect(holds({ source: "FIELD", fieldId: TEXT_FIELD, operator: "NEQ", value: "x" } as AutomationCondition, ctx)).toBe(false);
  });
});

describe("failing closed", () => {
  it("does not act on a field that is no longer available", () => {
    expect(holds({ source: "FIELD", fieldId: ARCHIVED_FIELD, operator: "IS_NOT_EMPTY" } as AutomationCondition)).toBe(false);
  });

  it("does not act on a field type it has no semantics for", () => {
    expect(holds({ source: "FIELD", fieldId: DATE_FIELD, operator: "EQ", value: "2026-01-01" } as AutomationCondition)).toBe(false);
  });

  it("treats an empty condition list as not matching", () => {
    // A rule with no conditions would otherwise fire on every single save.
    expect(evaluateConditions([], context())).toBe(false);
  });
});

describe("combining conditions", () => {
  it("requires every condition to hold", () => {
    expect(evaluateConditions([attribute("durationMinutes", "GT", 240), numeric("GTE", 6)], context())).toBe(true);
    expect(evaluateConditions([attribute("durationMinutes", "GT", 240), numeric("GTE", 99)], context())).toBe(false);
    expect(evaluateConditions([attribute("durationMinutes", "GT", 999), numeric("GTE", 6)], context())).toBe(false);
  });
});

describe("operators offered per field type", () => {
  it("lets NUMBER and COMPUTED be ordered", () => {
    expect(operatorsForFieldType("NUMBER")).toContain("GTE");
    expect(operatorsForFieldType("COMPUTED")).toContain("GTE");
  });

  it("does not let TEXT or LINK be ordered", () => {
    expect(operatorsForFieldType("TEXT")).not.toContain("GT");
    expect(operatorsForFieldType("LINK")).not.toContain("GT");
    expect(operatorsForFieldType("TEXT")).toContain("EQ");
  });

  it("offers BOOLEAN only its two truth operators", () => {
    expect([...operatorsForFieldType("BOOLEAN")]).toEqual(["IS_TRUE", "IS_FALSE"]);
  });

  it("supports no operators for the types whose comparison is undefined", () => {
    // Deliberate limitations, not oversights — see the comment in the source.
    for (const type of ["DATE", "TAGS", "CHECKLIST", "REFERENCE"]) {
      expect(operatorsForFieldType(type)).toHaveLength(0);
      expect(isConditionableFieldType(type)).toBe(false);
    }
  });

  it("supports nothing for a type it has never heard of", () => {
    expect(operatorsForFieldType("SOMETHING_NEW")).toHaveLength(0);
  });
});

describe("explaining why a rule cannot run", () => {
  const fields = [
    { id: NUMBER_FIELD, name: "Hours", type: "NUMBER" },
    { id: TEXT_FIELD, name: "Notes", type: "TEXT" },
    { id: DATE_FIELD, name: "When", type: "DATE" },
  ];
  const addTag = { type: "ADD_TAG", tagId: TAG_ID } as const;
  const check = (conditions: AutomationCondition[], action: unknown = addTag) =>
    describeRuleProblem(conditions, action as never, { fields, tagIds: new Set([TAG_ID]) });

  it("accepts a rule whose field and tag are both live", () => {
    expect(check([numeric("GT", 4)])).toBeNull();
  });

  it("accepts a rule that only reads entry attributes", () => {
    expect(check([attribute("status", "EQ", "DONE")], { type: "SET_STATUS", status: "DONE" })).toBeNull();
  });

  it("reports a field that has been archived or deleted", () => {
    // Never substitutes another field — the duplicate-name ambiguity US16 hit
    // is exactly what identifying fields by id avoids.
    expect(check([{ source: "FIELD", fieldId: ARCHIVED_FIELD, operator: "GT", value: 4 } as AutomationCondition]))
      .toMatch(/no longer available/i);
  });

  it("reports a field type that cannot be compared at all", () => {
    expect(check([{ source: "FIELD", fieldId: DATE_FIELD, operator: "EQ", value: "x" } as AutomationCondition]))
      .toMatch(/cannot compare/i);
  });

  it("reports an operator the field type does not admit", () => {
    expect(check([{ source: "FIELD", fieldId: TEXT_FIELD, operator: "GT", value: 4 } as AutomationCondition])).not.toBeNull();
  });

  it("reports a comparison value of the wrong type", () => {
    expect(check([{ source: "FIELD", fieldId: NUMBER_FIELD, operator: "EQ", value: "six" } as AutomationCondition]))
      .toMatch(/number/i);
    expect(check([{ source: "FIELD", fieldId: TEXT_FIELD, operator: "EQ", value: 6 } as AutomationCondition]))
      .toMatch(/text/i);
  });

  it("reports a tag that no longer exists", () => {
    expect(check([numeric("GT", 4)], { type: "ADD_TAG", tagId: ARCHIVED_FIELD })).toMatch(/tag/i);
  });
});
