import prisma from "../prisma.js";
import {
  parseExpression,
  aggregatesUsed,
  usesCount,
  evaluate,
  ExpressionError,
  type AggregateFn,
  type ExpressionNode,
} from "./expressions.js";

/**
 * Turning a US16 expression into a number, against one project's entries.
 *
 * This was written inline in the statistics controller when expressions were
 * only ever evaluated one at a time (US16). Saved statistics (US17) need the
 * same work for a whole list at once, so it lives here instead — and is
 * batched: whether one expression or twenty, it costs one query for the
 * project's fields, one for every aggregate they mention, and at most one for
 * the entry count.
 *
 * Nothing here parses or evaluates on its own; it feeds the engine in
 * expressions.ts and supplies the numbers it asks for.
 */

/**
 * Entry values are stored as text, so a row that does not look like a number
 * is excluded before it reaches ::numeric — one malformed row would otherwise
 * fail the whole aggregation (BUG-012). A fixed literal, never user input.
 */
const NUMERIC_VALUES = `~ '^-?[0-9]+([.][0-9]+)?$'`;

const normalise = (name: string) => name.trim().toLowerCase();
const key = (fn: AggregateFn, field: string) => `${fn}:${normalise(field)}`;

type Totals = { sum: number; avg: number; min: number; max: number };

/** A value, or the reason this one expression could not produce one. */
export type ExpressionOutcome = { value: number; error: null } | { value: null; error: string };

/**
 * Match each aggregate's field name against the project's live fields.
 * Throws ExpressionError — with a message meant for the person who wrote the
 * expression — when a name matches nothing, matches more than one field, or
 * names a field that cannot be aggregated.
 */
function resolveAgainst(
  fields: { id: string; name: string; type: string }[],
  trees: ExpressionNode[]
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const tree of trees) {
    for (const { fn, field } of aggregatesUsed(tree)) {
      if (resolved.has(key(fn, field))) continue;
      const matches = fields.filter((candidate) => normalise(candidate.name) === normalise(field));
      if (matches.length === 0) {
        throw new ExpressionError(`This project has no field called "${field}".`);
      }
      if (matches.length > 1) {
        throw new ExpressionError(
          `More than one field in this project is called "${field}". Rename one of them to use it in an expression.`
        );
      }
      const [match] = matches;
      // The same rule the group handler applies: a computed field always
      // holds a number, so it aggregates exactly like a Number field.
      if (match.type !== "NUMBER" && match.type !== "COMPUTED") {
        throw new ExpressionError(
          `"${match.name}" is a ${match.type.toLowerCase()} field, and ${fn}() needs a Number or Computed field.`
        );
      }
      resolved.set(key(fn, field), match.id);
    }
  }
  return resolved;
}

const liveFields = (projectId: string) =>
  prisma.entryField.findMany({
    where: { projectId, archivedAt: null },
    select: { id: true, name: true, type: true },
  });

/**
 * "Could this expression ever work here?" — syntax, and field names that
 * exist and may be aggregated. Deliberately says nothing about whether there
 * is data to aggregate today: AVG({Hours}) is a perfectly good saved
 * statistic before the first entry is written, and would be absurd to reject
 * only to accept an hour later.
 */
export async function validateExpressionForProject(projectId: string, expression: string): Promise<void> {
  const tree = parseExpression(expression);
  resolveAgainst(await liveFields(projectId), [tree]);
}

/**
 * Evaluate several expressions over one project. Each result stands alone:
 * one expression naming a field that has since been deleted reports its own
 * problem without spoiling the rest of the list.
 */
export async function evaluateExpressions(
  projectId: string,
  expressions: string[]
): Promise<ExpressionOutcome[]> {
  const outcomes: ExpressionOutcome[] = new Array(expressions.length);
  const trees = new Map<number, ExpressionNode>();

  expressions.forEach((expression, index) => {
    try {
      trees.set(index, parseExpression(expression));
    } catch (error) {
      outcomes[index] = { value: null, error: asMessage(error) };
    }
  });

  if (trees.size === 0) return outcomes;

  const fields = await liveFields(projectId);

  // Resolved per expression, so one bad field name does not fail the others.
  const resolutions = new Map<number, Map<string, string>>();
  for (const [index, tree] of trees) {
    try {
      resolutions.set(index, resolveAgainst(fields, [tree]));
    } catch (error) {
      outcomes[index] = { value: null, error: asMessage(error) };
      trees.delete(index);
    }
  }

  const fieldIds = new Set<string>();
  for (const resolved of resolutions.values()) {
    for (const id of resolved.values()) fieldIds.add(id);
  }

  const totals = await aggregateFields(projectId, [...fieldIds]);
  const entryCount = [...trees.values()].some(usesCount)
    ? await prisma.logbookEntry.count({ where: { projectId } })
    : 0;

  for (const [index, tree] of trees) {
    const resolved = resolutions.get(index)!;
    try {
      outcomes[index] = {
        value: evaluate(tree, {
          count: () => entryCount,
          aggregate: (fn, field) => {
            const row = totals.get(resolved.get(key(fn, field))!);
            // No row means no entry holds a usable number in that field. An
            // empty sum is genuinely 0; an average, smallest or largest of
            // nothing is not, and 0 there would be a wrong answer rather
            // than an empty one.
            if (!row) {
              if (fn === "SUM") return 0;
              throw new ExpressionError(
                `No entry has a number in "${field}" yet, so ${fn}(${field}) has no value.`
              );
            }
            return row[fn.toLowerCase() as keyof Totals];
          },
        }),
        error: null,
      };
    } catch (error) {
      outcomes[index] = { value: null, error: asMessage(error) };
    }
  }

  return outcomes;
}

/** Evaluate one expression, throwing rather than reporting. Used by the US16 endpoint. */
export async function evaluateExpressionForProject(projectId: string, expression: string): Promise<number> {
  const [outcome] = await evaluateExpressions(projectId, [expression]);
  if (outcome.error !== null) throw new ExpressionError(outcome.error);
  return outcome.value;
}

/** Every aggregate for every field named, in a single round trip. */
async function aggregateFields(projectId: string, ids: string[]): Promise<Map<string, Totals>> {
  const totals = new Map<string, Totals>();
  if (ids.length === 0) return totals;

  // The placeholders are generated here, never taken from the expression;
  // the ids themselves are bound parameters.
  const placeholders = ids.map((_id, index) => `$${index + 1}`).join(", ");
  const rows: any[] = await prisma.$queryRawUnsafe(
    `
      SELECT ev.field_id AS id,
             SUM((ev.value)::numeric) AS sum,
             AVG((ev.value)::numeric) AS avg,
             MIN((ev.value)::numeric) AS min,
             MAX((ev.value)::numeric) AS max
      FROM logbook_entries le
      JOIN entry_values ev ON ev.entry_id = le.id
       AND ev.field_id IN (${placeholders})
       AND ev.value ${NUMERIC_VALUES}
      WHERE le.project_id = $${ids.length + 1}
      GROUP BY ev.field_id
    `,
    ...ids,
    projectId
  );

  for (const row of rows) {
    totals.set(String(row.id), {
      sum: Number(row.sum),
      avg: Number(row.avg),
      min: Number(row.min),
      max: Number(row.max),
    });
  }
  return totals;
}

/** Only an ExpressionError carries a message fit to show; anything else is ours. */
function asMessage(error: unknown): string {
  if (error instanceof ExpressionError) return error.message;
  throw error;
}
