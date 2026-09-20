import { Response } from "express";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

// ── GET /tags — list the caller's own tag vocabulary (for autocomplete) ───

export const getTags = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId! },
      orderBy: { name: "asc" },
    });
    return res.json(tags.map((t) => ({ id: t.id, name: t.name })));
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return res.status(500).json({ error: "Failed to fetch tags" });
  }
};

// ── DELETE /tags/:id — remove a tag from the vocabulary entirely ─────────
// Detaches it from every project and entry it was on (cascades via the FK).

export const deleteTag = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const tag = await prisma.tag.findFirst({ where: { id, userId: req.userId! } });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    await prisma.tag.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    console.error("Failed to delete tag:", error);
    return res.status(500).json({ error: "Failed to delete tag" });
  }
};
