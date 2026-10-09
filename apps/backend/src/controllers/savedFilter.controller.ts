import { Response } from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

// Saved Entries-page filters, kept on the account so they follow the student
// between browsers and devices instead of living in one browser's storage.

/** More than anyone keeps as chips above a list; a guard, not a feature limit. */
const MAX_FILTERS = 50;

const filtersSchema = z.object({
  searchQuery: z.string().max(500),
  filterProjectId: z.string().max(100),
  filterTab: z.enum(["all", "week", "overdue"]),
  sortOrder: z.enum(["newest", "oldest"]),
  selectedTags: z.array(z.string().max(100)).max(50).optional(),
  fieldFilters: z
    .array(z.object({ fieldId: z.string().max(100), op: z.string().max(30), value: z.string().max(500) }))
    .max(20)
    .optional(),
  archivedFilter: z.enum(["exclude", "include", "only"]).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the filter a name").max(100, "That name is too long"),
  filters: filtersSchema,
});

function formatFilter(f: { id: string; name: string; filters: unknown; createdAt: Date }) {
  return { id: f.id, name: f.name, ...(f.filters as object), createdAt: f.createdAt.toISOString() };
}

// ── GET /saved-filters — the caller's filters, oldest first ──────────────

export const listSavedFilters = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = await prisma.savedFilter.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "asc" },
    });
    return res.json(filters.map(formatFilter));
  } catch (error) {
    console.error("Failed to fetch saved filters:", error);
    return res.status(500).json({ error: "Failed to fetch saved filters" });
  }
};

// ── POST /saved-filters — save the current filters under a name ──────────

export const createSavedFilter = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const count = await prisma.savedFilter.count({ where: { userId: req.userId! } });
    if (count >= MAX_FILTERS) {
      return res.status(400).json({ error: `You can keep at most ${MAX_FILTERS} saved filters` });
    }
    const filter = await prisma.savedFilter.create({
      data: { userId: req.userId!, name: parsed.data.name, filters: parsed.data.filters },
    });
    return res.status(201).json(formatFilter(filter));
  } catch (error) {
    console.error("Failed to save filter:", error);
    return res.status(500).json({ error: "Failed to save filter" });
  }
};

// ── DELETE /saved-filters/:id ────────────────────────────────────────────

export const deleteSavedFilter = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!z.uuid().safeParse(id).success) return res.status(404).json({ error: "Filter not found" });
    const { count } = await prisma.savedFilter.deleteMany({ where: { id, userId: req.userId! } });
    if (count === 0) return res.status(404).json({ error: "Filter not found" });
    return res.status(204).send();
  } catch (error) {
    console.error("Failed to delete filter:", error);
    return res.status(500).json({ error: "Failed to delete filter" });
  }
};
