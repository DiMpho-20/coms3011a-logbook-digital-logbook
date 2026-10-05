import { NextFunction, Response } from "express";
import { Prisma } from "@prisma/client";
import type { AcademicModule, Assessment } from "@prisma/client";
import { z } from "zod";
import type { AssessmentSection, GradeAssessment, GradeModule } from "@logbook/shared";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import {
  DATE_FIELDS,
  MARK_FIELDS,
  academicYearSchema,
  assessmentProblem,
  createAssessmentSchema,
  createModuleSchema,
  moduleShapeProblem,
  updateAssessmentSchema,
  updateModuleSchema,
  type AssessmentShape,
} from "../schemas/grades.schema.js";

// FEAT-009 (My Grades): a student's modules and their assessments. The API
// stores and returns exactly what the student entered; every grade figure is
// worked out on the client by the grade engine.

type LoadedAssessment = Assessment & { module: AcademicModule };

const MODULE_INCLUDE = {
  assessments: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.AcademicModuleInclude;

/** Changing a module's type rewrites its assessments' sections; keep that in one transaction. */
const TYPE_CHANGE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

// ── Ownership ────────────────────────────────────────────────────────────
// grades.routes.ts runs these for every route with a :moduleId or
// :assessmentId (router.param), so a handler never looks a record up by a raw
// id. A malformed id and another student's id are both simply not found.

export async function loadOwnedModule(req: AuthenticatedRequest, res: Response, next: NextFunction, id: string) {
  try {
    const module = z.uuid().safeParse(id).success
      ? await prisma.academicModule.findFirst({ where: { id, userId: req.userId! } })
      : null;
    if (!module) return res.status(404).json({ error: "Module not found" });
    res.locals.module = module;
    next();
  } catch (error) {
    console.error("Failed to load module:", error);
    return res.status(500).json({ error: "Failed to load module" });
  }
}

export async function loadOwnedAssessment(req: AuthenticatedRequest, res: Response, next: NextFunction, id: string) {
  try {
    const assessment = z.uuid().safeParse(id).success
      ? await prisma.assessment.findFirst({ where: { id, module: { userId: req.userId! } }, include: { module: true } })
      : null;
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    res.locals.assessment = assessment;
    next();
  } catch (error) {
    console.error("Failed to load assessment:", error);
    return res.status(500).json({ error: "Failed to load assessment" });
  }
}

const ownedModule = (res: Response) => res.locals.module as AcademicModule;
const ownedAssessment = (res: Response) => res.locals.assessment as LoadedAssessment;

// ── Shaping ──────────────────────────────────────────────────────────────

const toNumber = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
/** A DATE column comes back as midnight UTC, so its first ten characters are the day itself. */
const toDay = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));
const fromDay = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00.000Z`));

export function formatAssessment(assessment: Assessment): GradeAssessment {
  return {
    id: assessment.id,
    moduleId: assessment.moduleId,
    name: assessment.name,
    section: assessment.section as AssessmentSection | null,
    weight: assessment.weight.toNumber(),
    markObtained: toNumber(assessment.markObtained),
    markMax: toNumber(assessment.markMax),
    markPercent: toNumber(assessment.markPercent),
    missed: assessment.missed,
    date: toDay(assessment.date),
    dateKind: assessment.dateKind,
    remind: assessment.remind,
    position: assessment.position,
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
  };
}

export function formatModule(module: AcademicModule & { assessments: Assessment[] }): GradeModule {
  return {
    id: module.id,
    code: module.code,
    name: module.name,
    academicYear: module.academicYear,
    type: module.type,
    semester: module.semester as AssessmentSection | null,
    semester1Weight: toNumber(module.semester1Weight),
    targetMark: toNumber(module.targetMark),
    createdAt: module.createdAt.toISOString(),
    updatedAt: module.updatedAt.toISOString(),
    assessments: module.assessments.map(formatAssessment),
  };
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const duplicateModule = (code: string, year: number) => `You already have ${code} in ${year}`;

/** Raised inside a transaction to roll it back with a message for the student. */
class GradesConflict extends Error {}

// ── GET /grades/modules?year=2026 ────────────────────────────────────────

export const listModules = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let academicYear: number | undefined;
    if (req.query.year !== undefined) {
      const parsed = academicYearSchema.safeParse(Number(req.query.year));
      if (typeof req.query.year !== "string" || !parsed.success) {
        return res.status(400).json({ error: "year must be a year such as 2026" });
      }
      academicYear = parsed.data;
    }

    const modules = await prisma.academicModule.findMany({
      where: { userId: req.userId!, ...(academicYear !== undefined && { academicYear }) },
      include: MODULE_INCLUDE,
      orderBy: [{ academicYear: "desc" }, { code: "asc" }],
    });
    return res.json(modules.map(formatModule));
  } catch (error) {
    console.error("Failed to fetch modules:", error);
    return res.status(500).json({ error: "Failed to fetch modules" });
  }
};

// ── POST /grades/modules ─────────────────────────────────────────────────

export const createModule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createModuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const data = {
      ...parsed.data,
      semester: parsed.data.semester ?? null,
      semester1Weight: parsed.data.semester1Weight ?? null,
      targetMark: parsed.data.targetMark ?? null,
    };
    const problem = moduleShapeProblem(data);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const module = await prisma.academicModule.create({
        data: { ...data, userId: req.userId! },
        include: MODULE_INCLUDE,
      });
      return res.status(201).json(formatModule(module));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: duplicateModule(data.code, data.academicYear) });
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to create module:", error);
    return res.status(500).json({ error: "Failed to create module" });
  }
};

// ── GET /grades/modules/:moduleId ────────────────────────────────────────

export const getModule = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const module = await prisma.academicModule.findUniqueOrThrow({
      where: { id: ownedModule(res).id },
      include: MODULE_INCLUDE,
    });
    return res.json(formatModule(module));
  } catch (error) {
    console.error("Failed to fetch module:", error);
    return res.status(500).json({ error: "Failed to fetch module" });
  }
};

// ── PATCH /grades/modules/:moduleId ──────────────────────────────────────
// Changing type: a semester module's assessments move into the semester it
// ran in; a full-year module can only become a semester module while all of
// its assessments are in one semester, so no assessment is silently dropped.

export const updateModule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateModuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const current = ownedModule(res);
    const changes = parsed.data;
    const merged = {
      type: changes.type ?? current.type,
      semester: changes.semester !== undefined ? changes.semester : current.semester,
      semester1Weight:
        changes.semester1Weight !== undefined ? changes.semester1Weight : toNumber(current.semester1Weight),
    };
    const problem = moduleShapeProblem(merged);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const module = await prisma.$transaction(async (tx) => {
        if (merged.type !== current.type) {
          if (merged.type === "FULL_YEAR") {
            await tx.assessment.updateMany({ where: { moduleId: current.id }, data: { section: current.semester } });
          } else {
            const sections = await tx.assessment.findMany({
              where: { moduleId: current.id },
              distinct: ["section"],
              select: { section: true },
            });
            if (sections.length > 1) {
              throw new GradesConflict(
                "This module has assessments in both semesters. Move or delete one semester's assessments first."
              );
            }
            await tx.assessment.updateMany({ where: { moduleId: current.id }, data: { section: null } });
          }
        }
        return tx.academicModule.update({ where: { id: current.id }, data: changes, include: MODULE_INCLUDE });
      }, TYPE_CHANGE_TRANSACTION_OPTIONS);
      return res.json(formatModule(module));
    } catch (error) {
      if (error instanceof GradesConflict) return res.status(409).json({ error: error.message });
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          error: duplicateModule(changes.code ?? current.code, changes.academicYear ?? current.academicYear),
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to update module:", error);
    return res.status(500).json({ error: "Failed to update module" });
  }
};

// ── DELETE /grades/modules/:moduleId — and its assessments with it ───────

export const deleteModule = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.academicModule.delete({ where: { id: ownedModule(res).id } });
    return res.status(204).send();
  } catch (error: any) {
    if (error.code === "P2025") return res.status(404).json({ error: "Module not found" });
    console.error("Failed to delete module:", error);
    return res.status(500).json({ error: "Failed to delete module" });
  }
};

// ── POST /grades/modules/:moduleId/assessments ───────────────────────────

export const createAssessment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createAssessmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const module = ownedModule(res);
    const input = parsed.data;
    const shape: AssessmentShape = {
      section: input.section ?? null,
      markObtained: input.markObtained ?? null,
      markMax: input.markMax ?? null,
      markPercent: input.markPercent ?? null,
      missed: input.missed ?? false,
      date: input.date ?? null,
      dateKind: input.dateKind ?? null,
    };
    const problem = assessmentProblem(shape, module.type);
    if (problem) return res.status(400).json({ error: problem });

    // New assessments go to the end unless the student placed them.
    let position = input.position;
    if (position === undefined) {
      const last = await prisma.assessment.aggregate({ where: { moduleId: module.id }, _max: { position: true } });
      position = last._max.position === null ? 0 : last._max.position + 1;
    }

    const assessment = await prisma.assessment.create({
      data: {
        ...shape,
        date: fromDay(shape.date),
        moduleId: module.id,
        name: input.name,
        weight: input.weight,
        remind: input.remind ?? true,
        position,
      },
    });
    return res.status(201).json(formatAssessment(assessment));
  } catch (error) {
    console.error("Failed to create assessment:", error);
    return res.status(500).json({ error: "Failed to create assessment" });
  }
};

// ── PATCH /grades/assessments/:assessmentId ──────────────────────────────
// The mark and the date are each replaced as a whole when any part of them is
// sent, so switching 25/40 to 62.5% can't leave both behind.

export const updateAssessment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateAssessmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const current = ownedAssessment(res);
    const changes = parsed.data;
    const markSent = MARK_FIELDS.some((field) => changes[field] !== undefined);
    const dateSent = DATE_FIELDS.some((field) => changes[field] !== undefined);

    const shape: AssessmentShape = {
      section: changes.section !== undefined ? changes.section : current.section,
      ...(markSent
        ? {
            markObtained: changes.markObtained ?? null,
            markMax: changes.markMax ?? null,
            markPercent: changes.markPercent ?? null,
            missed: changes.missed ?? false,
          }
        : {
            markObtained: toNumber(current.markObtained),
            markMax: toNumber(current.markMax),
            markPercent: toNumber(current.markPercent),
            missed: current.missed,
          }),
      ...(dateSent
        ? { date: changes.date ?? null, dateKind: changes.dateKind ?? null }
        : { date: toDay(current.date), dateKind: current.dateKind }),
    };
    const problem = assessmentProblem(shape, current.module.type);
    if (problem) return res.status(400).json({ error: problem });

    const assessment = await prisma.assessment.update({
      where: { id: current.id },
      data: {
        ...shape,
        date: fromDay(shape.date),
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.weight !== undefined && { weight: changes.weight }),
        ...(changes.remind !== undefined && { remind: changes.remind }),
        ...(changes.position !== undefined && { position: changes.position }),
      },
    });
    return res.json(formatAssessment(assessment));
  } catch (error: any) {
    if (error.code === "P2025") return res.status(404).json({ error: "Assessment not found" });
    console.error("Failed to update assessment:", error);
    return res.status(500).json({ error: "Failed to update assessment" });
  }
};

// ── DELETE /grades/assessments/:assessmentId ─────────────────────────────

export const deleteAssessment = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.assessment.delete({ where: { id: ownedAssessment(res).id } });
    return res.status(204).send();
  } catch (error: any) {
    if (error.code === "P2025") return res.status(404).json({ error: "Assessment not found" });
    console.error("Failed to delete assessment:", error);
    return res.status(500).json({ error: "Failed to delete assessment" });
  }
};
