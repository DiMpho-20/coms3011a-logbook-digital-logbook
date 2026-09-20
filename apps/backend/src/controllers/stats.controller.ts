import { Request, Response } from "express";
import prisma from "../prisma.js";

// POST /projects/:projectId/stats/group
// Body: { metricFieldId, operation, groupByFieldId? }
export const groupStats = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
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
    if (!["NUMBER", "COMPUTED", "BOOLEAN", "TEXT", "TAGS"].includes(metricField.type)) {
      return res.status(400).json({ error: `Cannot aggregate field type ${metricField.type}` });
    }

    // Count doesn't need a numeric cast; everything else does. COMPUTED
    // fields always hold a number (that's what makes them computed), so
    // they aggregate the same way NUMBER fields do.
    const isCount = operation === "count";
    const isNumber = metricField.type === "NUMBER" || metricField.type === "COMPUTED";

    if (!isCount && !isNumber) {
      return res.status(400).json({ error: `${operation} requires a NUMBER field` });
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

      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT gv.value AS key, ${metricExpr} AS value
        FROM logbook_entries le
        JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $1
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
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT ${metricExpr} AS value
      FROM logbook_entries le
      JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $1
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
export const timelineStats = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
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
      metricJoin = "JOIN entry_values mv ON mv.entry_id = le.id AND mv.field_id = $3";
      params.push(metricFieldId);
    }

    const truncUnit = bucket; // 'day' | 'week' | 'month' maps directly to date_trunc
    const metricExpr = operation === "sum" ? "SUM((mv.value)::numeric)" : "COUNT(*)";
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT date_trunc('${truncUnit}', ev.value::date)::date AS date, ${metricExpr} AS value
      FROM logbook_entries le
      JOIN entry_values ev ON ev.entry_id = le.id AND ev.field_id = $1
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