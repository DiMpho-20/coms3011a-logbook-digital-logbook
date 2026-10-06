import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "../schemas/project.schema.js";
import type { TimeSummary } from "@logbook/shared";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { cleanTagNames, resolveTagIds } from "../utils/tags.js";

const TAGS_INCLUDE = { tags: { include: { tag: true } } } as const;

/** Shape a Prisma Project (with included tag join rows) into the API response. */
function formatProject<T extends { tags?: { tag: { name: string } }[] }>(project: T) {
  const { tags, ...rest } = project;
  return { ...rest, tags: (tags ?? []).map((t) => t.tag.name).sort() };
}

/** Extract the authenticated user's ID from req.userId (set by requireAuth middleware). */
function getUserId(req: AuthenticatedRequest): string {
  return req.userId!;
}

/** Detect Prisma P2002 unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error as any)?.code === "P2002"
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

export const createProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const validatedData = createProjectSchema.parse(req.body);

    // Application-level uniqueness pre-check (DB constraint is the safety net)
    if (await nameExistsForUser(userId, validatedData.name)) {
      return res.status(409).json({
        error: "You already have a project with that name",
      });
    }

    const tagNames = cleanTagNames(validatedData.tags);
    const tagIds = await resolveTagIds(prisma, userId, tagNames);

    const project = await prisma.project.create({
      data: {
        userId,
        name: validatedData.name,
        description: validatedData.description,
        status: validatedData.status ?? "ACTIVE",
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: TAGS_INCLUDE,
    });

    return res.status(201).json(formatProject(project));
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

export const getProjects = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: TAGS_INCLUDE,
    });

    return res.status(200).json(projects.map(formatProject));
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
};

// ── GET /projects/:id ────────────────────────────────────────────────────

export const getProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        entryFields: {
          orderBy: { createdAt: "asc" },
        },
        ...TAGS_INCLUDE,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json(formatProject(project));
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch project" });
  }
};

// ── GET /projects/:id/time-summary ───────────────────────────────────────

export const getProjectTimeSummary = async (req: AuthenticatedRequest, res: Response) => {
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

    const totalMinutes = entries.reduce((sum: number, e: any) => sum + e.durationMinutes, 0);
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

// ── GET /projects/time-summaries ─────────────────────────────────────────

/**
 * Every project's time summary in one request, replacing the one request per
 * project the projects and statistics pages used to fan out. One row per
 * project — including projects with no entries — in the same order the
 * project list comes in, so callers can join on id.
 */
export const getAllProjectTimeSummaries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    const projects = await prisma.project.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const grouped = await prisma.logbookEntry.groupBy({
      by: ["projectId"],
      where: { project: { userId } },
      _sum: { durationMinutes: true },
      _count: { id: true },
      _max: { createdAt: true },
    });
    const byProject = new Map(grouped.map((g) => [g.projectId, g]));

    return res.status(200).json(
      projects.map((p) => {
        const g = byProject.get(p.id);
        const totalMinutes = g?._sum.durationMinutes ?? 0;
        return {
          projectId: p.id,
          totalMinutes,
          totalHours: Math.round((totalMinutes / 60) * 10) / 10,
          entryCount: g?._count.id ?? 0,
          lastEntryAt: g?._max.createdAt?.toISOString() ?? null,
        } satisfies TimeSummary;
      })
    );
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch time summaries" });
  }
};

// ── PUT /projects/:id ────────────────────────────────────────────────────

export const updateProject = async (req: AuthenticatedRequest, res: Response) => {
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

    const tagNames = validatedData.tags !== undefined ? cleanTagNames(validatedData.tags) : undefined;
    const tagIds = tagNames !== undefined ? await resolveTagIds(prisma, userId, tagNames) : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          ...(validatedData.name !== undefined && { name: validatedData.name }),
          ...(validatedData.description !== undefined && { description: validatedData.description }),
          ...(validatedData.status !== undefined && { status: validatedData.status }),
        },
      });

      // Replace the tag set wholesale when tags are provided.
      if (tagIds !== undefined) {
        await tx.projectTag.deleteMany({ where: { projectId: id } });
        if (tagIds.length > 0) {
          await tx.projectTag.createMany({
            data: tagIds.map((tagId) => ({ projectId: id, tagId })),
          });
        }
      }

      return tx.project.findUniqueOrThrow({ where: { id }, include: TAGS_INCLUDE });
    });

    return res.status(200).json(formatProject(updated));
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

export const updateProjectStatus = async (req: AuthenticatedRequest, res: Response) => {
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
      include: TAGS_INCLUDE,
    });

    return res.status(200).json(formatProject(updatedProject));
  } catch (error: any) {
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── DELETE /projects/:id ─────────────────────────────────────────────────
// Permanent, unlike archiving: the project goes with its fields, entries,
// their values, version history and tag links (all cascade in the schema).
// The interface confirms first, naming how many entries will be lost.

export const deleteProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = String(req.params.id);

    const existing = await prisma.project.findFirst({
      where: { id, userId },
      include: { _count: { select: { entries: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Project not found" });
    }

    await prisma.project.delete({ where: { id } });

    return res.status(200).json({
      message: "Project deleted",
      deletedEntries: existing._count.entries,
    });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return res.status(500).json({ error: "Failed to delete project" });
  }
};