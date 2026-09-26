import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { ExpressionError } from "../utils/expressions.js";
import {
  validateExpressionForProject,
  evaluateExpressions,
} from "../utils/expressionEvaluation.js";
import {
  createCustomStatisticSchema,
  updateCustomStatisticSchema,
} from "../schemas/customStatistic.schema.js";

/**
 * US17 — statistics an owner writes themselves.
 *
 * Only the definition is stored. Every read works the value out from the
 * project's current entries through the same US16 evaluator the Custom
 * Expression panel uses, so a saved statistic follows the data instead of
 * freezing the number it happened to have when it was saved.
 */

type Stored = {
  id: string;
  projectId: string;
  name: string;
  expression: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Ownership is the project's: a statistic belongs to whoever owns its project. */
const ownedProject = (projectId: string, userId: string) =>
  prisma.project.findFirst({ where: { id: projectId, userId } });

const isDuplicateName = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Shape one statistic for the API, with the value worked out now. */
function present(stored: Stored, outcome: { value: number | null; error: string | null }) {
  return {
    id: stored.id,
    projectId: stored.projectId,
    name: stored.name,
    expression: stored.expression,
    // A saved statistic can stop working — its field may since have been
    // renamed or deleted — so the reason travels with it rather than
    // failing the whole request.
    value: outcome.value,
    error: outcome.error,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

async function presentOne(stored: Stored) {
  const [outcome] = await evaluateExpressions(stored.projectId, [stored.expression]);
  return present(stored, outcome);
}

// ── POST /projects/:projectId/custom-statistics ──────────────────────────

export const createCustomStatistic = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const parsed = createCustomStatisticSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    // Validated, not evaluated: AVG({Hours}) is a perfectly good statistic to
    // save before the first entry exists, and refusing it only to accept the
    // same text an hour later would be absurd.
    await validateExpressionForProject(projectId, parsed.data.expression);

    const stored = await prisma.customStatistic.create({
      data: { projectId, userId: req.userId!, ...parsed.data },
    });

    return res.status(201).json(await presentOne(stored));
  } catch (error: any) {
    if (error instanceof ExpressionError) return res.status(400).json({ error: error.message });
    if (isDuplicateName(error)) {
      return res.status(409).json({ error: "You already have a statistic with that name in this project" });
    }
    console.error("createCustomStatistic failed:", error);
    return res.status(500).json({ error: "Failed to save the statistic" });
  }
};

// ── GET /projects/:projectId/custom-statistics ───────────────────────────

export const listCustomStatistics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const stored = await prisma.customStatistic.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    // One batched evaluation for the whole list rather than one per row.
    const outcomes = await evaluateExpressions(projectId, stored.map((item) => item.expression));

    return res.json(stored.map((item, index) => present(item, outcomes[index])));
  } catch (error: any) {
    console.error("listCustomStatistics failed:", error);
    return res.status(500).json({ error: "Failed to load your statistics" });
  }
};

// ── GET /projects/:projectId/custom-statistics/:id ───────────────────────

export const getCustomStatistic = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const stored = await prisma.customStatistic.findFirst({
      where: { id: String(req.params.id), projectId },
    });
    if (!stored) return res.status(404).json({ error: "Statistic not found" });

    return res.json(await presentOne(stored));
  } catch (error: any) {
    console.error("getCustomStatistic failed:", error);
    return res.status(500).json({ error: "Failed to load the statistic" });
  }
};

// ── PATCH /projects/:projectId/custom-statistics/:id ─────────────────────

export const updateCustomStatistic = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const existing = await prisma.customStatistic.findFirst({
      where: { id: String(req.params.id), projectId },
    });
    if (!existing) return res.status(404).json({ error: "Statistic not found" });

    const parsed = updateCustomStatisticSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    // Checked before anything is written, so a bad expression can never
    // replace a working one.
    if (parsed.data.expression !== undefined) {
      await validateExpressionForProject(projectId, parsed.data.expression);
    }

    const stored = await prisma.customStatistic.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    return res.json(await presentOne(stored));
  } catch (error: any) {
    if (error instanceof ExpressionError) return res.status(400).json({ error: error.message });
    if (isDuplicateName(error)) {
      return res.status(409).json({ error: "You already have a statistic with that name in this project" });
    }
    console.error("updateCustomStatistic failed:", error);
    return res.status(500).json({ error: "Failed to update the statistic" });
  }
};

// ── DELETE /projects/:projectId/custom-statistics/:id ────────────────────

export const deleteCustomStatistic = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const existing = await prisma.customStatistic.findFirst({
      where: { id: String(req.params.id), projectId },
    });
    if (!existing) return res.status(404).json({ error: "Statistic not found" });

    await prisma.customStatistic.delete({ where: { id: existing.id } });
    return res.json({ message: "Statistic deleted" });
  } catch (error: any) {
    console.error("deleteCustomStatistic failed:", error);
    return res.status(500).json({ error: "Failed to delete the statistic" });
  }
};
