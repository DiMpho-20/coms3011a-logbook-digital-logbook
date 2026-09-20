import type { PrismaClient } from "@prisma/client";
import { calculateComputedValues } from "./computedFields.js";

type SnapshotField = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  required: boolean;
  formula: string | null;
  archivedAt: null;
  createdAt: string;
  updatedAt: string;
};

type EntryFormatVersionResult = {
  id: string;
  projectId: string;
  version: number;
  fields: SnapshotField[];
  createdAt: Date;
};

/** Store an immutable copy of the active format after every format change. */
export async function createFormatVersion(prisma: PrismaClient, projectId: string): Promise<EntryFormatVersionResult> {
  const fields = await prisma.entryField.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const latest = await prisma.entryFormatVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const snapshot: SnapshotField[] = fields.map((field) => ({
    id: field.id, projectId: field.projectId, name: field.name, type: field.type,
    required: field.required, formula: field.formula, archivedAt: null,
    createdAt: field.createdAt.toISOString(), updatedAt: field.updatedAt.toISOString(),
  }));

  const created = await prisma.entryFormatVersion.create({
    data: { projectId, version: (latest?.version ?? 0) + 1, fields: snapshot },
  });

  return {
    id: created.id,
    projectId: created.projectId,
    version: created.version,
    fields: created.fields as SnapshotField[],
    createdAt: created.createdAt,
  };
}

const DEFAULT_VALUE_BY_TYPE: Record<string, string> = {
  TEXT: "",
  NUMBER: "0",
  BOOLEAN: "false",
  DATE: "",
  TAGS: "[]",
  CHECKLIST: "[]",
  LINK: "",
  REFERENCE: "null",
};

/**
 * When a field is added to a project that already has entries, those
 * entries shouldn't just be missing it forever — give each one a reasonable
 * default (or, for a computed field, whatever its formula produces from
 * that entry's own numbers) so the new field is a real part of the format
 * everywhere: editing an old entry, exporting it, and aggregating stats
 * across every entry rather than silently dropping the ones that predate
 * the field.
 */
export async function backfillNewField(
  prisma: PrismaClient,
  projectId: string,
  field: { id: string; type: string; formula: string | null }
): Promise<void> {
  const entries = await prisma.logbookEntry.findMany({
    where: { projectId },
    select: { id: true, values: { select: { fieldId: true, value: true } } },
  });
  if (entries.length === 0) return;

  if (field.type === "COMPUTED" && field.formula) {
    await prisma.$transaction(
      entries.map((entry) => {
        const raw = Object.fromEntries(entry.values.map((v) => [v.fieldId, v.value]));
        let value = "0";
        try {
          const computed = calculateComputedValues([field], raw);
          if (field.id in computed) value = String(computed[field.id]);
        } catch {
          // This entry's existing values don't support the formula — leave the default.
        }
        return prisma.entryValue.upsert({
          where: { entryId_fieldId: { entryId: entry.id, fieldId: field.id } },
          create: { entryId: entry.id, fieldId: field.id, value },
          update: {},
        });
      })
    );
    return;
  }

  const defaultValue = DEFAULT_VALUE_BY_TYPE[field.type] ?? "";
  await prisma.$transaction(
    entries.map((entry) =>
      prisma.entryValue.upsert({
        where: { entryId_fieldId: { entryId: entry.id, fieldId: field.id } },
        create: { entryId: entry.id, fieldId: field.id, value: defaultValue },
        update: {},
      })
    )
  );
}
