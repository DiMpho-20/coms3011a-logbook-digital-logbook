import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "../schemas/project.schema.js";
import type { TimeSummary } from "@logbook/shared";

/** Extract the x-user-id header as the acting user. */
function getUserId(req: Request): string {
  return ((req as any).user?.id || req.headers["x-user-id"]) as string;
}

/** Detect Prisma P2002 unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** Application-level check: does this user already have a project with this name? */
async function nameExistsForUser(userId: string, name: string, excludeId?: string): Promise<boolean> {
  const match = await prisma.project.findFirst({
    where: {
      userId,
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  return match !== null;
}

// ── POST /projects ───────────────────────────────────────────────────────

export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const validatedData = createProjectSchema.parse(req.body);

    // Application-level uniqueness pre-check (DB constraint is the safety net)
    if (await nameExistsForUser(userId, validatedData.name)) {
      return res.status(409).json({
        error: "You already have a project with that name",
      });
    }

    const project = await prisma.project.create({
      data: {
        userId,
        name: validatedData.name,
        description: validatedData.description,
        status: validatedData.status ?? "ACTIVE",
      },
    });

    return res.status(201).json(project);
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        error: "You already have a project with that name",
      });
    }
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── GET /projects ────────────────────────────────────────────────────────

export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(projects);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
};

// ── GET /projects/:id ────────────────────────────────────────────────────

export const getProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        entryFields: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json(project);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch project" });
  }
};

// ── GET /projects/:id/time-summary ───────────────────────────────────────

export const getProjectTimeSummary = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Aggregate entry data
    const entries = await prisma.logbookEntry.findMany({
      where: { projectId: id },
      select: {
        id: true,
        durationMinutes: true,
        createdAt: true,
        entryDate: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const entryCount = entries.length;
    const lastEntryAt = entryCount > 0 ? entries[0].createdAt.toISOString() : null;

    return res.status(200).json({
      projectId: id,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      entryCount,
      lastEntryAt,
    } satisfies TimeSummary);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch time summary" });
  }
};

// ── PUT /projects/:id ────────────────────────────────────────────────────

export const updateProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);
    const validatedData = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Application-level uniqueness pre-check when renaming
    if (validatedData.name !== undefined && validatedData.name !== existing.name) {
      if (await nameExistsForUser(userId, validatedData.name, id)) {
        return res.status(409).json({
          error: "You already have a project with that name",
        });
      }
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(validatedData.name !== undefined && { name: validatedData.name }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.status !== undefined && { status: validatedData.status }),
      },
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        error: "You already have a project with that name",
      });
    }
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── PATCH /projects/:id/status ───────────────────────────────────────────

export const updateProjectStatus = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);
    const { status } = updateProjectStatusSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Project not found" });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: { status },
    });

    return res.status(200).json(updatedProject);
  } catch (error: any) {
    return res.status(400).json({ error: error.errors || error.message });
  }
};
