import { describe, it, expect } from "vitest";
import {
  parseExpression,
  evaluate,
  aggregatesUsed,
  ExpressionError,
  type AggregateFn,
  type AggregateSource,
} from "../utils/expressions.js";

// A stand-in for the database. The evaluator only ever asks for numbers, so
// the parser and the arithmetic can be tested without touching Postgres.
type Totals = Record<string, Partial<Record<AggregateFn, number>>>;

const source = (totals: Totals, entries = 5): AggregateSource => ({
  count: () => entries,
  aggregate: (fn, field) => {
    const value = totals[field.toLowerCase()]?.[fn];
    if (value === undefined) throw new ExpressionError(`No ${fn} for ${field}.`);
    return value;
  },
});

const HOURS = { hours: { SUM: 40, AVG: 8, MIN: 2, MAX: 15 } };

const run = (expression: string, totals: Totals = HOURS, entries = 5) =>
  evaluate(parseExpression(expression), source(totals, entries));

describe("expressions — the aggregate functions", () => {
  it("counts the entries in scope", () => {
    expect(run("COUNT()")).toBe(5);
  });

  it("totals a field", () => {
    expect(run("SUM(hours)")).toBe(40);
  });

  it("averages a field", () => {
    expect(run("AVG(hours)")).toBe(8);
  });

  it("finds the smallest and largest value", () => {
    expect(run("MIN(hours)")).toBe(2);
    expect(run("MAX(hours)")).toBe(15);
  });

  it("does not mind how the function is capitalised", () => {
    expect(run("sum(hours)")).toBe(40);
    expect(run("Count()")).toBe(5);
  });
});

describe("expressions — arithmetic", () => {
  it("divides one aggregate by another", () => {
    expect(run("SUM(hours) / COUNT()")).toBe(8);
  });

  it("adds two fields together", () => {
    const totals = { hours: { SUM: 40 }, tasks: { SUM: 12 } };
    expect(run("SUM(hours) + SUM(tasks)", totals)).toBe(52);
  });

  it("gives multiplication precedence over addition", () => {
    const totals = { a: { SUM: 3 }, b: { SUM: 4 } };
    // 3 + (4 * 2), not (3 + 4) * 2
    expect(run("SUM(a) + SUM(b) * 2", totals)).toBe(11);
  });

  it("lets parentheses override precedence", () => {
    const totals = { a: { SUM: 3 }, b: { SUM: 4 } };
    expect(run("(SUM(a) + SUM(b)) * 2", totals)).toBe(14);
  });

  it("handles nested parentheses", () => {
    expect(run("((AVG(hours) * 2) + 1)")).toBe(17);
  });

  it("handles subtraction and division left to right", () => {
    const totals = { a: { SUM: 100 } };
    expect(run("SUM(a) / 5 / 2", totals)).toBe(10);
    expect(run("SUM(a) - 30 - 20", totals)).toBe(50);
  });

  it("accepts decimals and a leading minus", () => {
    expect(run("-AVG(hours) + 0.5")).toBe(-7.5);
    expect(run("MAX(hours) * 1.5")).toBe(22.5);
  });

  it("does not care about whitespace", () => {
    expect(run("   SUM(hours)/COUNT()   ")).toBe(8);
    expect(run("SUM( hours )")).toBe(40);
  });

  it("reads a field name in braces, so names with spaces work", () => {
    const totals = { "tasks completed": { SUM: 9 } };
    expect(run("SUM({Tasks Completed})", totals)).toBe(9);
  });
});

describe("expressions — what it refuses", () => {
  const refuses = (expression: string, fragment: RegExp) =>
    expect(() => run(expression)).toThrow(fragment);

  it("refuses an empty expression", () => {
    refuses("", /Write an expression/i);
    refuses("   ", /Write an expression/i);
  });

  it("refuses a function it does not know", () => {
    refuses("MEDIAN(hours)", /not a function/i);
  });

  it("refuses a bare word that is not a call", () => {
    refuses("hours", /not a function/i);
  });

  it("refuses COUNT with a field, which it does not take", () => {
    refuses("COUNT(hours)", /takes no field/i);
  });

  it("refuses an aggregate with no field", () => {
    refuses("SUM()", /needs the name of a field/i);
  });

  it("refuses unmatched parentheses, either way round", () => {
    refuses("(SUM(hours)", /without a matching \)/i);
    refuses("SUM(hours))", /without a matching \(/i);
    refuses("SUM(hours", /missing its closing/i);
  });

  it("refuses an unclosed field name", () => {
    refuses("SUM({Tasks", /never closed/i);
  });

  it("refuses characters that cannot appear in an expression", () => {
    refuses("SUM(hours) ; DROP TABLE users", /not something an expression can contain/i);
    refuses("SUM(hours) % 2", /not something an expression can contain/i);
  });

  it("refuses an operator with nothing to work on", () => {
    refuses("SUM(hours) +", /ends too early/i);
    refuses("* SUM(hours)", /needs a value on both sides/i);
  });

  it("refuses to divide by zero rather than returning Infinity", () => {
    refuses("SUM(hours) / 0", /divides by zero/i);
    expect(() => run("SUM(hours) / COUNT()", HOURS, 0)).toThrow(/divides by zero/i);
  });

  it("passes on the reason a field has no aggregate", () => {
    refuses("SUM(notes)", /No SUM for notes/);
  });
});

describe("expressions — aggregatesUsed", () => {
  it("lists every field the expression needs, once each", () => {
    const node = parseExpression("SUM(hours) / COUNT() + SUM(hours) - AVG(hours)");
    expect(aggregatesUsed(node)).toEqual([
      { fn: "SUM", field: "hours" },
      { fn: "AVG", field: "hours" },
    ]);
  });

  it("finds fields inside parentheses and negations", () => {
    const node = parseExpression("-(MIN(a) + MAX(b))");
    expect(aggregatesUsed(node)).toEqual([
      { fn: "MIN", field: "a" },
      { fn: "MAX", field: "b" },
    ]);
  });

  it("returns nothing for an expression with no fields", () => {
    expect(aggregatesUsed(parseExpression("COUNT() * 2"))).toEqual([]);
  });
});
