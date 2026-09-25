import { describe, it, expect } from "vitest";

import {
  findFormulaProblem,
  formulaIdsToNames,
  formulaNamesToIds,
  orderForSaving,
  previewComputedValues,
} from "../formulas";

const fields = [
  { id: "f-hours", name: "Hours", type: "NUMBER" },
  { id: "f-rate", name: "Hourly rate", type: "NUMBER" },
  { id: "f-notes", name: "Notes", type: "TEXT" },
];

const computed = (id: string, name: string, formula: string) => ({ id, name, type: "COMPUTED", formula });

describe("formulaIdsToNames", () => {
  it("shows stored ids as field names", () => {
    expect(formulaIdsToNames("{f-hours} * {f-rate}", fields)).toBe("{Hours} * {Hourly rate}");
  });

  it("leaves an id it cannot resolve untouched", () => {
    expect(formulaIdsToNames("{gone} + 1", fields)).toBe("{gone} + 1");
  });
});

describe("findFormulaProblem", () => {
  it("accepts names, case-insensitively and with spaces", () => {
    expect(findFormulaProblem(computed("c", "Pay", "({hours} + 1) * { Hourly rate }"), fields)).toBeNull();
  });

  it("accepts a formula of constants only", () => {
    expect(findFormulaProblem(computed("c", "Six", "2 * 3"), fields)).toBeNull();
  });

  it("accepts another computed field", () => {
    const pay = computed("c1", "Pay", "{Hours} * {Hourly rate}");
    const withTax = computed("c2", "With tax", "{Pay} * 1.15");
    expect(findFormulaProblem(withTax, [...fields, pay, withTax])).toBeNull();
  });

  it("requires a formula", () => {
    expect(findFormulaProblem(computed("c", "Pay", "  "), fields)).toMatch(/needs a formula/);
  });

  it("rejects a name that is not a Number or Computed field", () => {
    expect(findFormulaProblem(computed("c", "Pay", "{Notes} * 2"), fields)).toMatch(/no Number or Computed field/);
    expect(findFormulaProblem(computed("c", "Pay", "{Minutes} * 2"), fields)).toMatch(/no Number or Computed field/);
  });

  it("rejects a field that uses itself", () => {
    const pay = computed("c", "Pay", "{Pay} + 1");
    expect(findFormulaProblem(pay, [...fields, pay])).toMatch(/cannot use itself/);
  });

  it("rejects computed fields that depend on each other in a loop", () => {
    const a = computed("a", "A", "{B} + 1");
    const b = computed("b", "B", "{A} + 1");
    expect(findFormulaProblem(a, [...fields, a, b])).toMatch(/loop/);
  });

  it("rejects a name shared by two fields", () => {
    const twice = [...fields, { id: "f-hours-2", name: "hours", type: "NUMBER" }];
    expect(findFormulaProblem(computed("c", "Pay", "{Hours}"), twice)).toMatch(/more than one/);
  });

  it("rejects anything but arithmetic", () => {
    expect(findFormulaProblem(computed("c", "Pay", "{Hours} + abc"), fields)).toMatch(/may only contain/);
  });
});

describe("orderForSaving", () => {
  it("saves plain fields first, then computed fields after the ones they use", () => {
    const withTax = computed("c2", "With tax", "{Pay} * 1.15");
    const pay = computed("c1", "Pay", "{Hours} * {Hourly rate}");
    const order = orderForSaving([withTax, ...fields, pay]).map((field) => field.id);
    expect(order).toEqual(["f-hours", "f-rate", "f-notes", "c1", "c2"]);
  });

  it("also follows stored id references, as a backup holds them", () => {
    const later = computed("c2", "Later", "{c1} * 2");
    const earlier = computed("c1", "Earlier", "{f-hours} + 1");
    expect(orderForSaving([later, earlier, ...fields]).map((field) => field.id).slice(-2)).toEqual(["c1", "c2"]);
  });
});

describe("formulaNamesToIds", () => {
  it("swaps names for the saved ids", () => {
    const ids = new Map([["f-hours", "srv-1"], ["f-rate", "srv-2"]]);
    expect(formulaNamesToIds(computed("c", "Pay", " {hours} * {Hourly rate} "), fields, ids)).toBe("{srv-1} * {srv-2}");
  });
});

describe("previewComputedValues", () => {
  const all = [
    ...fields,
    computed("tax", "With tax", "{pay} * 2"),
    computed("pay", "Pay", "{f-hours} * {f-rate}"),
  ];

  it("works out chained computed fields from the form's values", () => {
    expect(previewComputedValues(all, { "f-hours": 20, "f-rate": "5" })).toEqual({ pay: 100, tax: 200 });
  });

  it("gives null until every number it needs is filled in", () => {
    expect(previewComputedValues(all, { "f-hours": 20, "f-rate": "" })).toEqual({ pay: null, tax: null });
  });
});
