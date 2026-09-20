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

/**
 * When a COMPUTED field is added to a project that already has entries,
 * those entries shouldn't just be missing it forever — work out what its
 * formula produces from each entry's own existing numbers, so the field
 * behaves like a real part of the format everywhere: editing an old entry,
 * exporting it, and aggregating stats across every entry.
 *
 * This is deliberately COMPUTED-only. An ordinary field (NUMBER, BOOLEAN, …)
 * has no value to derive — an old entry genuinely never recorded "Hours"
 * before the field existed, and fabricating a "0" for it would corrupt any
 * average or min/max computed over the field afterwards (every pre-existing
 * entry would silently drag the average down and force the min to 0, even
 * though nobody ever logged 0). Leaving it genuinely absent lets stats
 * naturally include only the entries that actually have a value — which is
 * the correct entries to average, min, or max over — while an old entry
 * still picks the field up the moment someone edits it in.
 */
export async function backfillNewField(
  prisma: PrismaClient,
  projectId: string,
  field: { id: string; type: string; formula: string | null }
): Promise<void> {
  if (field.type !== "COMPUTED" || !field.formula) return;

  const entries = await prisma.logbookEntry.findMany({
    where: { projectId },
    select: { id: true, values: { select: { fieldId: true, value: true } } },
  });
  if (entries.length === 0) return;

  // Only entries the formula can actually be computed for get a row — an
  // entry missing the numbers it depends on is skipped, not fabricated.
  const writes = entries.flatMap((entry) => {
    const raw = Object.fromEntries(entry.values.map((v) => [v.fieldId, v.value]));
    try {
      const computed = calculateComputedValues([field], raw);
      if (!(field.id in computed)) return [];
      return [
        prisma.entryValue.upsert({
          where: { entryId_fieldId: { entryId: entry.id, fieldId: field.id } },
          create: { entryId: entry.id, fieldId: field.id, value: String(computed[field.id]) },
          update: {},
        }),
      ];
    } catch {
      return [];
    }
  });

  if (writes.length > 0) await prisma.$transaction(writes);
}
