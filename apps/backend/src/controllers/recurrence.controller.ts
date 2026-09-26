import { Response } from "express";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

/** Disable or re-enable a recurrence rule the caller owns. */
export const updateRecurrence = async (req: AuthenticatedRequest, res: Response) => {
  const id = String(req.params.id);
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });

  const rule = await prisma.recurrenceRule.findFirst({ where: { id, project: { userId: req.userId! } } });
  if (!rule) return res.status(404).json({ error: "Recurrence not found" });

  const updated = await prisma.recurrenceRule.update({ where: { id }, data: { enabled } });
  return res.status(200).json({
    id: updated.id,
    pattern: updated.pattern,
    enabled: updated.enabled,
    nextOccurrence: updated.nextOccurrence.toISOString(),
    until: updated.until?.toISOString() ?? null,
  });
};
