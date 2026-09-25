import { Response } from "express";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import {
  parseExpression,
  aggregatesUsed,
  usesCount,
  evaluate,
  ExpressionError,
  type AggregateFn,
} from "../utils/expressions.js";
import { evaluateExpressionSchema } from "../schemas/expression.schema.js";

/**
 * These handlers aggregate an owner's data, so they must establish who the
 * owner is. Typed as plain Request they could not read req.userId at all.
 */
async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

/**
 * Entry values are stored as text, so a row that does not look like a number
 * must be excluded before it reaches ::numeric — one bad row otherwise fails
 * the whole aggregation with 22P02 and takes the statistics page down
 * (BUG-012). Entries no longer write empty values, but rows written before
 * that fix are still in the database and must not break anything.
 *
 * Both constants are fixed literals, never built from user input.
 */
const NUMERIC_VALUES = `~ '^-?[0-9]+([.][0-9]+)?$'`;
/**
 * count does not cast, so it needs no numeric test — but an empty row still
 * means "this entry never recorded a value", and counting it would report
 * more entries as having filled the field in than actually did.
 */
const NON_EMPTY_VALUES = `<> ''`;
const DATE_VALUES = `~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`;

// POST /projects/:projectId/stats/group
// Body: { metricFieldId, operation, groupByFieldId? }
export const groupStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }
    const { metricFieldId, operation, groupByFieldId } = req.body;

    if (!metricFieldId || !operation) {
      return res.status(400).json({ error: "metricFieldId and operation are required" });
    }

    const allowedOps = ["sum", "avg", "count", "min", "max"];
    if (!allowedOps.includes(operation)) {
      return res.status(400).json({ error: `operation must be one of ${allowedOps.join(", ")}` });
    }

    const metricField = await prisma.entryField.findFirst({
      where: { id: metricFieldId, projectId },
    });
    if (!metricField) {
      return res.status(404).json({ error: "Metric field not found" });
    }

    // Count doesn't need a numeric cast, so it works for a field of any
    // type — "how many entries have this filled in" is meaningful whether
    // the field is a CHECKLIST, a LINK or a NUMBER. COMPUTED fields always
    // hold a number (that's what makes them computed), so sum/avg/min/max
    // treat them the same as NUMBER.
    const isCount = operation === "count";
    const isNumber = metricField.type === "NUMBER" || metricField.type === "COMPUTED";

    if (!isCount && !isNumber) {
      return res.status(400).json({ error: `${operation} requires a Number or Computed field` });
    }

    const metricCast = isCount ? "" : `(mv.value)::numeric`;
    const metricExpr = isCount ? "COUNT(*)" : `${operation.toUpperCase()}(${metricCast})`;

    // Build SQL
    if (groupByFieldId) {
      const groupField = await prisma.entryField.findFirst({
        where: { id: groupByFieldId, projectId },
      });
      if (!groupField) {
        return res.status(404).json({ error: "Group-by field not found" });
      }

      const metricGuard = `AND mv.value ${isCount ? NON_EMPTY_VALUES : NUMERIC_VALUES}`;
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT gv.value AS key, ${metricExpr} AS value
        FROM logbook_entries le
        JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $1 ${metricGuard}
        JOIN entry_values gv ON gv.entry_id = le.id AND gv.field_id = $2
        WHERE le.project_id = $3
        GROUP BY gv.value
        ORDER BY value DESC
      `, metricFieldId, groupByFieldId, projectId);

      return res.json({
        groups: rows.map((r) => ({
          key: r.key,
          value: Number(r.value),
        })),
      });
    }

    // No grouping — single total
    const totalGuard = `AND mv.value ${isCount ? NON_EMPTY_VALUES : NUMERIC_VALUES}`;
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT ${metricExpr} AS value
      FROM logbook_entries le
      JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $1 ${totalGuard}
      WHERE le.project_id = $2
    `, metricFieldId, projectId);

    return res.json({
      groups: [{ key: "total", value: Number(rows[0]?.value ?? 0) }],
    });
  } catch (error: any) {
    console.error("groupStats failed:", error);
    return res.status(500).json({ error: error.message || "Failed to compute stats" });
  }
};

// POST /projects/:projectId/stats/timeline
// Body: { dateFieldId, bucket: "day" | "week" | "month", operation?: "count" | "sum", metricFieldId? }
// Plots either how many entries fall in each bucket (default), or the total
// of a NUMBER/COMPUTED field across the entries in each bucket.
export const timelineStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }
    const { dateFieldId, bucket = "day", operation = "count", metricFieldId } = req.body;

    if (!dateFieldId) {
      return res.status(400).json({ error: "dateFieldId is required" });
    }
    if (!["day", "week", "month"].includes(bucket)) {
      return res.status(400).json({ error: "bucket must be day, week, or month" });
    }
    if (!["count", "sum"].includes(operation)) {
      return res.status(400).json({ error: "operation must be count or sum" });
    }

    const dateField = await prisma.entryField.findFirst({
      where: { id: dateFieldId, projectId },
    });
    if (!dateField) {
      return res.status(404).json({ error: "Date field not found" });
    }
    if (dateField.type !== "DATE") {
      return res.status(400).json({ error: "dateFieldId must point to a DATE field" });
    }

    let metricJoin = "";
    const params: unknown[] = [dateFieldId, projectId];
    if (operation === "sum") {
      if (!metricFieldId) {
        return res.status(400).json({ error: "metricFieldId is required for sum" });
      }
      const metricField = await prisma.entryField.findFirst({ where: { id: metricFieldId, projectId } });
      if (!metricField) {
        return res.status(404).json({ error: "Metric field not found" });
      }
      if (!["NUMBER", "COMPUTED"].includes(metricField.type)) {
        return res.status(400).json({ error: "sum requires a NUMBER or COMPUTED field" });
      }
      metricJoin = `JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $3 AND mv.value ${NUMERIC_VALUES}`;
      params.push(metricFieldId);
    }

    const truncUnit = bucket; // 'day' | 'week' | 'month' maps directly to date_trunc
    const metricExpr = operation === "sum" ? "SUM((mv.value)::numeric)" : "COUNT(*)";
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT date_trunc('${truncUnit}', ev.value::date)::date AS date, ${metricExpr} AS value
      FROM logbook_entries le
      JOIN entry_values ev ON ev.entry_id = le.id AND ev.field_id = $1 AND ev.value ${DATE_VALUES}
      ${metricJoin}
      WHERE le.project_id = $2
      GROUP BY date_trunc('${truncUnit}', ev.value::date)
      ORDER BY date ASC
    `, ...params);

    return res.json({
      points: rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
        value: Number(r.value),
      })),
    });
  } catch (error: any) {
    console.error("timelineStats failed:", error);
    return res.status(500).json({ error: error.message || "Failed to compute timeline" });
  }
};

// POST /projects/:projectId/stats/expression
// Body: { expression }  e.g. "SUM(hours) / COUNT()"
//
// US16. Scope is one project: the statistics page already works a project
// at a time, the ownership check is the same one the other two handlers
// use, and a project-wide answer is what "an expression over their own
// entries" means here. Every entry of that project takes part, archived
// ones included, because that is what group and timeline already do.
export const evaluateExpression = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const parsed = evaluateExpressionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    // Parsed once, then reused for both the field lookup and the arithmetic.
    const tree = parseExpression(parsed.data.expression);
    const wanted = aggregatesUsed(tree);

    // Names are matched against this project's live fields only, so a name
    // can never reach the database as anything but a field id this owner
    // already has.
    const fields = await prisma.entryField.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, name: true, type: true },
    });
    const normalise = (name: string) => name.trim().toLowerCase();

    const resolved = new Map<string, string>(); // "FN:field" -> field id
    const fieldIds = new Set<string>();
    for (const { fn, field } of wanted) {
      const matches = fields.filter((candidate) => normalise(candidate.name) === normalise(field));
      if (matches.length === 0) {
        return res.status(400).json({ error: `This project has no field called "${field}".` });
      }
      if (matches.length > 1) {
        return res.status(400).json({
          error: `More than one field in this project is called "${field}". Rename one of them to use it in an expression.`,
        });
      }
      const [match] = matches;
      // Same rule the group handler applies: a computed field always holds a
      // number, so it aggregates exactly like a Number field.
      if (match.type !== "NUMBER" && match.type !== "COMPUTED") {
        return res.status(400).json({
          error: `"${match.name}" is a ${match.type.toLowerCase()} field, and ${fn}() needs a Number or Computed field.`,
        });
      }
      resolved.set(`${fn}:${normalise(field)}`, match.id);
      fieldIds.add(match.id);
    }

    // One round trip for every field the expression mentions, rather than
    // one per mention. Same numeric guard as the other handlers: a row that
    // does not look like a number is left out instead of failing the cast.
    const totals = new Map<string, { sum: number; avg: number; min: number; max: number }>();
    if (fieldIds.size > 0) {
      const ids = [...fieldIds];
      const placeholders = ids.map((_id, index) => `$${index + 1}`).join(", ");
      const rows: any[] = await prisma.$queryRawUnsafe(`
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
      `, ...ids, projectId);
      for (const row of rows) {
        totals.set(String(row.id), {
          sum: Number(row.sum),
          avg: Number(row.avg),
          min: Number(row.min),
          max: Number(row.max),
        });
      }
    }

    // Only asked for when the expression actually uses COUNT().
    let entryCount: number | null = null;
    const countEntries = async () => {
      if (entryCount === null) {
        entryCount = await prisma.logbookEntry.count({ where: { projectId } });
      }
      return entryCount;
    };
    if (usesCount(tree)) await countEntries();

    const value = evaluate(tree, {
      count: () => entryCount ?? 0,
      aggregate: (fn: AggregateFn, field: string) => {
        const id = resolved.get(`${fn}:${normalise(field)}`)!;
        const row = totals.get(id);
        // No row means no entry has a usable number in that field yet.
        // An empty sum is genuinely 0; an average, smallest or largest of
        // nothing is not, and reporting 0 for those would be a wrong answer
        // rather than an empty one.
        if (!row) {
          if (fn === "SUM") return 0;
          throw new ExpressionError(`No entry has a number in "${field}" yet, so ${fn}(${field}) has no value.`);
        }
        return row[fn.toLowerCase() as "sum" | "avg" | "min" | "max"];
      },
    });

    return res.json({ value });
  } catch (error: any) {
    if (error instanceof ExpressionError) {
      return res.status(400).json({ error: error.message });
    }
    // Anything else is ours, not theirs: log it and say nothing specific.
    console.error("evaluateExpression failed:", error);
    return res.status(500).json({ error: "Failed to evaluate the expression" });
  }
};
