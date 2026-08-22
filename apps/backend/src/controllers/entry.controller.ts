import { Request, Response } from "express";
import prisma from "../prisma.js";
import { createEntrySchema, updateEntrySchema } from "../schemas/entry.schema.js";
import type { Entry } from "@logbook/shared";

/**
 * Convert an array of EntryValue records (with included field) into a
 * flat Record keyed by fieldId, casting values to their declared types.
 */
function flattenValues(
  values: { fieldId: string; value: string; field: { type: string } }[]
): Record<string, string | number | boolean | null> {
  const map: Record<string, string | number | boolean | null> = {};
  for (const ev of values) {
    if (ev.field.type === "NUMBER") {
      map[ev.fieldId] = Number(ev.value) || 0;
    } else if (ev.field.type === "BOOLEAN") {
      map[ev.fieldId] = ev.value === "true";
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
  values: { fieldId: string; value: string; field: { type: string } }[];
}): Entry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    durationMinutes: entry.durationMinutes,
    entryDate: entry.entryDate?.toISOString() ?? null,
    dueDate: entry.dueDate?.toISOString() ?? null,
    values: flattenValues(entry.values),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// ── GET /projects/:projectId/entries ─────────────────────────────────────

export const getEntries = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);

    const entries = await prisma.logbookEntry.findMany({
      where: { projectId },
      include: {
        values: { include: { field: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(entries.map(formatEntry));
  } catch (error) {
    console.error("Failed to fetch entries:", error);
    return res.status(500).json({ error: "Failed to fetch entries" });
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

    const entry = await prisma.logbookEntry.create({
      data: {
        projectId,
        durationMinutes: validated.durationMinutes,
        entryDate: validated.entryDate,
        dueDate: validated.dueDate,
        values: {
          create: Object.entries(validated.values).map(([fieldId, value]) => ({
            fieldId,
            value: String(value ?? ""),
          })),
        },
      },
      include: {
        values: { include: { field: true } },
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

    const entry = await prisma.$transaction(async (tx) => {
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
        for (const [fieldId, value] of Object.entries(validated.values)) {
          await tx.entryValue.upsert({
            where: { entryId_fieldId: { entryId: id, fieldId } },
            create: { entryId: id, fieldId, value: String(value ?? "") },
            update: { value: String(value ?? "") },
          });
        }
      }

      return tx.logbookEntry.findUnique({
        where: { id },
        include: { values: { include: { field: true } } },
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
