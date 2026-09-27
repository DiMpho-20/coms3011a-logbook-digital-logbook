import { Response } from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

// US19 — the student's dashboard layout, saved on the server so it follows
// them between browsers and devices. The frontend owns the list of panels
// and skips any it doesn't know, so only the shape of an id is checked here.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** A built-in panel ("recent-entries") or a saved statistic ("stat:<projectId>:<statisticId>"). */
const PANEL_ID = new RegExp(`^([a-z][a-z-]{0,39}|stat:${UUID}:${UUID})$`, "i");

const layoutSchema = z.object({
  panels: z
    .array(z.string().regex(PANEL_ID, "Unknown panel id"))
    .max(50, "A dashboard can have at most 50 panels")
    .refine((panels) => new Set(panels).size === panels.length, { message: "A panel can only appear once" }),
});

// ── GET /dashboard/layout — { panels: null } until the student saves one ─

export const getLayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const layout = await prisma.dashboardLayout.findUnique({ where: { userId: req.userId! } });
    return res.json({ panels: layout?.panels ?? null, updatedAt: layout?.updatedAt.toISOString() ?? null });
  } catch (error) {
    console.error("Failed to fetch dashboard layout:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard layout" });
  }
};

// ── PUT /dashboard/layout — replace the saved layout ─────────────────────

export const saveLayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = layoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { panels } = parsed.data;
    const layout = await prisma.dashboardLayout.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, panels },
      update: { panels },
    });
    return res.json({ panels: layout.panels, updatedAt: layout.updatedAt.toISOString() });
  } catch (error) {
    console.error("Failed to save dashboard layout:", error);
    return res.status(500).json({ error: "Failed to save dashboard layout" });
  }
};

// ── DELETE /dashboard/layout — back to the default dashboard ─────────────

export const resetLayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.dashboardLayout.deleteMany({ where: { userId: req.userId! } });
    return res.status(204).send();
  } catch (error) {
    console.error("Failed to reset dashboard layout:", error);
    return res.status(500).json({ error: "Failed to reset dashboard layout" });
  }
};
