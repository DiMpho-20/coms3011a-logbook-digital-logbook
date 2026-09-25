import type { Prisma, PrismaClient } from "@prisma/client";
import { affectedComputedFields, calculateComputedValues } from "./computedFields.js";

export type SnapshotField = {
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
  await recalculateComputedFields(prisma, projectId, field.id);
}

/**
 * Rewrites the stored results of every computed field affected by a change to
 * `changedFieldId` — the field itself and every computed field that uses it —
 * on every entry in the project. Called when a field is added and when a
 * formula is edited, so old entries never keep a result worked out from a
 * formula that no longer applies (views and statistics read these rows).
 *
 * An entry the formula cannot be worked out for (a division by zero, say) is
 * left without a row rather than keeping its old, now-wrong result. Pass a
 * transaction client to make the rewrite atomic with the field change.
 */
export async function recalculateComputedFields(
  db: Prisma.TransactionClient,
  projectId: string,
  changedFieldId: string
): Promise<void> {
  const fields = await db.entryField.findMany({ where: { projectId, archivedAt: null } });
  const targets = affectedComputedFields(changedFieldId, fields);
  if (targets.length === 0) return;

  const entries = await db.logbookEntry.findMany({
    where: { projectId },
    select: { id: true, values: { select: { fieldId: true, value: true } } },
  });
  if (entries.length === 0) return;

  const rows = entries.flatMap((entry) => {
    const raw = Object.fromEntries(entry.values.map((v) => [v.fieldId, v.value]));
    // One target at a time, so a formula that fails for this entry does not
    // stop the others from being worked out.
    return targets.flatMap((fieldId) => {
      try {
        const result = calculateComputedValues(fields, raw, [fieldId]);
        return fieldId in result ? [{ entryId: entry.id, fieldId, value: String(result[fieldId]) }] : [];
      } catch {
        return [];
      }
    });
  });

  await db.entryValue.deleteMany({ where: { fieldId: { in: targets }, entry: { projectId } } });
  if (rows.length > 0) await db.entryValue.createMany({ data: rows });
}
