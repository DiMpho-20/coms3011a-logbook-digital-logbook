import { Request, Response } from "express";
import prisma from "../prisma.js";
import { createEntrySchema, updateEntrySchema } from "../schemas/entry.schema.js";
import type { Entry } from "@logbook/shared";
import { calculateComputedValues } from "../utils/computedFields.js";

/**
 * Convert an array of EntryValue records (with included field) into a
 * flat Record keyed by fieldId, casting values to their declared types.
 */
function flattenValues(values: { fieldId: string; value: string; field: { type: string } }[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const ev of values) {
    if (ev.field.type === "NUMBER") {
      map[ev.fieldId] = Number(ev.value) || 0;
    } else if (ev.field.type === "BOOLEAN") {
      map[ev.fieldId] = ev.value === "true";
    } else if (["TAGS", "CHECKLIST", "REFERENCE"].includes(ev.field.type)) {
      try { map[ev.fieldId] = JSON.parse(ev.value); } catch { map[ev.fieldId] = ev.value; }
    } else {
      map[ev.fieldId] = ev.value;
    }
  }
  return map;
}

/** Shape a Prisma LogbookEntry (with included values) into the API response. */
function formatEntry(entry: {
  id: string;
  projectId: string;
  durationMinutes: number;
  entryDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  values: { fieldId: string; value: string; field: any }[];
  formatVersion?: { version: number; fields: unknown } | null;
  status: string;
  completedAt: Date | null;
}): Entry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    durationMinutes: entry.durationMinutes,
    entryDate: entry.entryDate?.toISOString() ?? null,
    dueDate: entry.dueDate?.toISOString() ?? null,
    values: flattenValues(entry.values),
    status: entry.status as "OPEN" | "DONE",
    completedAt: entry.completedAt?.toISOString() ?? null,
    // Legacy entries predate snapshots; derive their historical field list from
    // the retained fields referenced by their values.
    format: entry.formatVersion
      ? { version: entry.formatVersion.version, fields: entry.formatVersion.fields as any }
      : entry.values.length
        ? { version: 0, fields: entry.values.map((value) => ({ ...value.field, createdAt: value.field.createdAt?.toISOString?.() ?? value.field.createdAt, updatedAt: value.field.updatedAt?.toISOString?.() ?? value.field.updatedAt, archivedAt: value.field.archivedAt?.toISOString?.() ?? value.field.archivedAt })) }
        : null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// ── GET /projects/:projectId/entries ─────────────────────────────────────

export const getEntries = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const { status, dueBefore } = req.query;

    const where: any = { projectId };
    if (status === "OPEN" || status === "DONE") where.status = status;
    if (dueBefore) where.dueDate = { lte: new Date(String(dueBefore)) };

    const entries = await prisma.logbookEntry.findMany({
      where: { projectId },
      include: {
        values: { include: { field: true } },
        formatVersion: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(entries.map(formatEntry));
  } catch (error) {
    console.error("Failed to fetch entries:", error);
    return res.status(500).json({ error: "Failed to fetch entries" });
  }
};

export const updateEntryStatus = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    if (status !== "OPEN" && status !== "DONE") {
      return res.status(400).json({ error: "status must be OPEN or DONE" });
    }

    const entry = await prisma.logbookEntry.update({
      where: { id },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
      include: {
        values: { include: { field: true } },
        formatVersion: true,
      },
    });

    return res.status(200).json(formatEntry(entry));
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Entry not found" });
    }
    console.error("Failed to update entry status:", error);
    return res.status(500).json({ error: "Failed to update entry status" });
  }
};

// ── POST /projects/:projectId/entries ────────────────────────────────────

export const createEntry = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const validated = createEntrySchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fields = await prisma.entryField.findMany({ where: { projectId, archivedAt: null } });
    const suppliedValues = Object.fromEntries(Object.entries(validated.values).filter(([fieldId]) => fields.find((field) => field.id === fieldId && field.type !== "COMPUTED")));
    const computedValues = calculateComputedValues(fields, suppliedValues);
    const latestFormat = await prisma.entryFormatVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    const entry = await prisma.logbookEntry.create({
      data: {
        projectId,
        formatVersionId: latestFormat?.id,
        durationMinutes: validated.durationMinutes,
        entryDate: validated.entryDate,
        dueDate: validated.dueDate,
        values: {
          create: Object.entries({ ...suppliedValues, ...computedValues }).map(([fieldId, value]) => ({
            fieldId,
            value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
          })),
        },
      },
      include: {
        values: { include: { field: true } },
        formatVersion: true,
      },
    });

    return res.status(201).json(formatEntry(entry));
  } catch (error: any) {
    console.error("Failed to create entry:", error);
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── PUT /entries/:id ─────────────────────────────────────────────────────

export const updateEntry = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const validated = updateEntrySchema.parse(req.body);

    const existing = await prisma.logbookEntry.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Entry not found" });
    }

    const entry = await prisma.$transaction(async (tx: any) => {
      // Build the data object for fields that were provided
      const entryData: Record<string, unknown> = {};
      if (validated.durationMinutes !== undefined) {
        entryData.durationMinutes = validated.durationMinutes;
      }
      if (validated.entryDate !== undefined) {
        entryData.entryDate = validated.entryDate;
      }
      if (validated.dueDate !== undefined) {
        entryData.dueDate = validated.dueDate;
      }

      if (Object.keys(entryData).length > 0) {
        await tx.logbookEntry.update({ where: { id }, data: entryData });
      }

      if (validated.values) {
        const fields = await tx.entryField.findMany({ where: { projectId: existing.projectId, archivedAt: null } });
        const existingValues = await tx.entryValue.findMany({ where: { entryId: id } });
        const valueMap: Record<string, unknown> = Object.fromEntries(existingValues.map((value: any) => [value.fieldId, value.value]));
        Object.assign(valueMap, validated.values);
        const computedValues = calculateComputedValues(fields, valueMap);
        for (const [fieldId, value] of Object.entries({ ...validated.values, ...computedValues })) {
          await tx.entryValue.upsert({
            where: { entryId_fieldId: { entryId: id, fieldId } },
            create: { entryId: id, fieldId, value: typeof value === "object" ? JSON.stringify(value) : String(value ?? "") },
            update: { value: typeof value === "object" ? JSON.stringify(value) : String(value ?? "") },
          });
        }
      }

      return tx.logbookEntry.findUnique({
        where: { id },
        include: { values: { include: { field: true } }, formatVersion: true },
      });
    });

    if (!entry) {
      return res.status(404).json({ error: "Entry not found" });
    }

    return res.status(200).json(formatEntry(entry));
  } catch (error: any) {
    console.error("Failed to update entry:", error);
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── DELETE /entries/:id ──────────────────────────────────────────────────

export const deleteEntry = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.logbookEntry.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Entry not found" });
    }

    await prisma.logbookEntry.delete({ where: { id } });

    return res.status(200).json({ message: "Entry deleted" });
  } catch (error) {
    console.error("Failed to delete entry:", error);
    return res.status(500).json({ error: "Failed to delete entry" });
  }
};
