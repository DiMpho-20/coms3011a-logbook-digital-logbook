import { Response } from "express";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { logbookBackupSchema, type LogbookBackup } from "../schemas/import.schema.js";
import { calculateComputedValues, validateFormula } from "../utils/computedFields.js";
import { validateEntryValues, isEmptyValue } from "../utils/entryValues.js";
import { cleanTagNames, resolveTagIds } from "../utils/tags.js";
import type { SnapshotField } from "../utils/entryFormat.js";
import { toSnapshot } from "../utils/entryVersions.js";
import { ENTRY_INCLUDE, formatEntry } from "./entry.controller.js";

type BackupProject = LogbookBackup["projects"][number];
type BackupField = BackupProject["fields"][number];
type Tx = Prisma.TransactionClient;

/** A problem with the backup itself; rolls the import back and is reported as a 400. */
class ImportError extends Error {}

/**
 * A backup can hold hundreds of entries, each several statements, all inside
 * one transaction. Prisma's 5s default would abort a perfectly good restore
 * on a slow connection.
 */
const IMPORT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };

const FIELD_REFERENCE = /\{([^}]+)\}/g;

/**
 * The backup's fields in an order where every field a formula reads is
 * created before the formula that reads it, so its new id is already known
 * when the formula is rewritten. A computed field may read one listed after it.
 */
function orderForCreation(fields: BackupField[]): BackupField[] {
  const ids = new Set(fields.map((f) => f.id));
  const placed = new Set<string>();
  const ordered: BackupField[] = [];
  let pending = fields;
  while (pending.length > 0) {
    const ready = pending.filter((field) =>
      field.type !== "COMPUTED" || !field.formula
      || [...field.formula.matchAll(FIELD_REFERENCE)].every(([, id]) => !ids.has(id.trim()) || placed.has(id.trim())));
    if (ready.length === 0) {
      throw new ImportError(`The computed fields "${pending.map((f) => f.name).join('", "')}" depend on each other in a loop.`);
    }
    for (const field of ready) placed.add(field.id);
    ordered.push(...ready);
    pending = pending.filter((field) => !placed.has(field.id));
  }
  return ordered;
}

/** Where each project and entry in the backup was recreated, keyed by its old id. */
type IdMap = {
  projectByOldId: Map<string, string>;
  /** For backups written before ids were exported: a project's name is unique per student. */
  projectByName: Map<string, string>;
  entryByOldId: Map<string, { id: string; projectId: string }>;
};

/**
 * Point a reference at the copy of what it pointed at (issues #86, #90). A
 * project is found by its old id, or by name in an older backup; an entry by
 * its old id. Anything that cannot be matched (something not in the backup)
 * was already a broken link, so it is left out rather than failing the import.
 */
function remapReference(value: unknown, ids: IdMap) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = value as { id?: unknown; kind?: unknown; label?: unknown };
  const label = typeof ref.label === "string" ? { label: ref.label } : {};
  if ((ref.kind ?? "project") === "entry") {
    const target = typeof ref.id === "string" ? ids.entryByOldId.get(ref.id) : undefined;
    return target ? { id: target.id, ...label, kind: "entry" as const, projectId: target.projectId } : null;
  }
  if (ref.kind !== undefined && ref.kind !== "project") return null;
  const id = (typeof ref.id === "string" && ids.projectByOldId.get(ref.id))
    || (typeof ref.label === "string" && ids.projectByName.get(ref.label));
  return id ? { id, ...label, kind: "project" as const } : null;
}

/** A timestamp from the backup, or the fallback when an older backup has none. */
const dateOr = (value: string | null | undefined, fallback: Date) => (value ? new Date(value) : fallback);

/**
 * Every computed result the entry's numbers allow. One field at a time, as
 * recalculateComputedFields does, so a formula that cannot be worked out for
 * this entry (a division by zero, say) leaves only that field empty.
 */
function computeValues(fields: { id: string; type: string; formula: string | null }[], values: Record<string, unknown>) {
  const results: Record<string, number> = {};
  for (const field of fields.filter((f) => f.type === "COMPUTED")) {
    try {
      Object.assign(results, calculateComputedValues(fields, values, [field.id]));
    } catch {
      // Left without a value rather than failing the restore.
    }
  }
  return results;
}

async function restore(tx: Tx, userId: string, backup: LogbookBackup) {
  // Project names are unique per student, so a project that clashes with one
  // already in the account is imported alongside it under a new name.
  const taken = new Set((await tx.project.findMany({ where: { userId }, select: { name: true } }))
    .map((p) => p.name.trim().toLowerCase()));
  const freeName = (name: string) => {
    let candidate = name;
    for (let n = 1; taken.has(candidate.trim().toLowerCase()); n++) {
      candidate = n === 1 ? `${name} (imported)` : `${name} (imported ${n})`;
    }
    taken.add(candidate.trim().toLowerCase());
    return candidate;
  };

  // Tags are shared across the account, so they are resolved once up front.
  const tagNames = cleanTagNames(backup.projects.flatMap((p) => [...(p.tags ?? []), ...p.entries.flatMap((e) => e.tags ?? [])]));
  const tagIds = await resolveTagIds(tx, userId, tagNames);
  const tagIdByName = new Map(tagNames.map((name, i) => [name, tagIds[i]]));
  const tagLinks = (names: string[] | undefined) => cleanTagNames(names)
    .map((name) => tagIdByName.get(name))
    .filter((tagId): tagId is string => Boolean(tagId))
    .map((tagId) => ({ tagId }));

  // Every project and its fields first, then the entries, so an entry can
  // refer to a project that comes later in the file.
  const created: { project: BackupProject; id: string; fieldIds: Map<string, string>; formatVersionId: string | null }[] = [];
  const ids: IdMap = { projectByOldId: new Map(), projectByName: new Map(), entryByOldId: new Map() };

  for (const project of backup.projects) {
    const now = new Date();
    const { id: projectId } = await tx.project.create({
      data: {
        userId,
        name: freeName(project.name),
        description: project.description ?? undefined,
        status: project.status,
        tags: { create: tagLinks(project.tags) },
        createdAt: dateOr(project.createdAt, now),
        updatedAt: dateOr(project.updatedAt, now),
      },
      select: { id: true },
    });
    if (project.id) ids.projectByOldId.set(project.id, projectId);
    ids.projectByName.set(project.name, projectId);

    // Created in dependency order but dated in backup order, so the fields
    // come back in the order the student arranged them.
    const base = Date.now();
    const position = new Map(project.fields.map((f, i) => [f.id, i]));
    const fieldIds = new Map<string, string>();
    const createdFields: { id: string; name: string; type: string; required: boolean; formula: string | null }[] = [];
    for (const field of orderForCreation(project.fields)) {
      let formula: string | null = null;
      if (field.type === "COMPUTED") {
        if (!field.formula?.trim()) throw new ImportError(`Computed field "${field.name}" in "${project.name}" has no formula.`);
        // The formula embeds the old ids of the fields it reads.
        formula = field.formula.trim().replace(FIELD_REFERENCE, (match, oldId: string) => {
          const newId = fieldIds.get(oldId.trim());
          return newId ? `{${newId}}` : match;
        });
        try {
          validateFormula(formula, createdFields);
        } catch (error) {
          throw new ImportError(`Computed field "${field.name}" in "${project.name}": ${(error as Error).message}`);
        }
      }
      const row = await tx.entryField.create({
        data: {
          projectId,
          name: field.name,
          type: field.type,
          required: field.type === "COMPUTED" ? false : field.required,
          formula,
          createdAt: new Date(base + position.get(field.id)!),
        },
      });
      fieldIds.set(field.id, row.id);
      createdFields.push(row);
    }

    // One format version holding the restored fields, as the field endpoints
    // would have left behind, so restored entries keep their format.
    let formatVersionId: string | null = null;
    if (createdFields.length > 0) {
      const rows = await tx.entryField.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
      const snapshot: SnapshotField[] = rows.map((f) => ({
        id: f.id, projectId: f.projectId, name: f.name, type: f.type, required: f.required, formula: f.formula,
        archivedAt: null, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
      }));
      ({ id: formatVersionId } = await tx.entryFormatVersion.create({
        data: { projectId, version: 1, fields: snapshot },
        select: { id: true },
      }));
    }
    created.push({ project, id: projectId, fieldIds, formatVersionId });
  }

  // Every entry's new id is chosen before any is written, so an entry can
  // link to one that is restored after it.
  const newEntryIds = created.map(({ project, id: projectId }) => project.entries.map((entry) => {
    const id = crypto.randomUUID();
    if (entry.id) ids.entryByOldId.set(entry.id, { id, projectId });
    return id;
  }));

  let entries = 0;
  for (const [projectIndex, { project, id: projectId, fieldIds, formatVersionId }] of created.entries()) {
    const fields = await tx.entryField.findMany({ where: { projectId } });
    const referenceFields = new Set(project.fields.filter((f) => f.type === "REFERENCE").map((f) => f.id));
    const computedFields = new Set(project.fields.filter((f) => f.type === "COMPUTED").map((f) => f.id));
    // An older backup has no timestamps. It lists entries newest first, so
    // dating them in that order still keeps the restored logbook in order.
    const base = Date.now();

    for (const [index, entry] of project.entries.entries()) {
      const values: Record<string, unknown> = {};
      for (const [oldFieldId, value] of Object.entries(entry.values)) {
        const newFieldId = fieldIds.get(oldFieldId);
        // Computed results are worked out again below rather than trusted.
        if (!newFieldId || computedFields.has(oldFieldId)) continue;
        if (referenceFields.has(oldFieldId)) {
          const remapped = remapReference(value, ids);
          if (remapped) values[newFieldId] = remapped;
          continue;
        }
        values[newFieldId] = value;
      }
      const shapeError = validateEntryValues(fields, values);
      if (shapeError) throw new ImportError(`An entry in "${project.name}" is invalid: ${shapeError}`);
      // Required fields are not enforced here: a field made required after
      // entries were logged leaves those entries without it, and a restore
      // has to bring back what was recorded rather than refuse it.

      const createdAt = dateOr(entry.createdAt, new Date(base - index));
      const done = entry.status === "DONE";
      const archived = Boolean(entry.archivedAt) || entry.archived === true;
      const row = formatEntry(await tx.logbookEntry.create({
        data: {
          id: newEntryIds[projectIndex][index],
          projectId,
          formatVersionId,
          durationMinutes: entry.durationMinutes,
          entryDate: entry.entryDate ? new Date(entry.entryDate) : null,
          dueDate: entry.dueDate ? new Date(entry.dueDate) : null,
          status: done ? "DONE" : "OPEN",
          completedAt: done ? dateOr(entry.completedAt, createdAt) : null,
          archivedAt: archived ? dateOr(entry.archivedAt, createdAt) : null,
          createdAt,
          updatedAt: dateOr(entry.updatedAt, createdAt),
          values: {
            create: Object.entries({ ...values, ...computeValues(fields, values) })
              .filter(([, value]) => !isEmptyValue(value))
              .map(([fieldId, value]) => ({
                fieldId,
                value: typeof value === "object" ? JSON.stringify(value) : String(value),
              })),
          },
          tags: { create: tagLinks(entry.tags) },
        },
        include: ENTRY_INCLUDE,
      }));
      // A brand-new entry has no versions, so this is version 1 without the
      // lookup recordVersion does — one round trip less per restored entry.
      await tx.entryVersion.create({
        data: {
          entryId: row.id,
          version: 1,
          reason: "CREATED",
          snapshot: toSnapshot(row) as unknown as Prisma.InputJsonValue,
          createdAt,
        },
      });
      entries++;
    }
  }

  return { projects: created.length, entries };
}

// ── POST /import ─────────────────────────────────────────────────────────

/**
 * Restore a JSON backup in one transaction (issue #87). Recreating it one
 * request at a time from the browser left a half-imported logbook behind
 * whenever a request failed part-way, and retrying duplicated what had
 * already gone in. Now either everything in the file is imported or nothing is.
 */
export const importLogbook = async (req: AuthenticatedRequest, res: Response) => {
  let backup: LogbookBackup;
  try {
    backup = logbookBackupSchema.parse(req.body);
  } catch (error) {
    const detail = error instanceof ZodError ? error.issues[0]?.message : undefined;
    return res.status(400).json({ error: `This is not a valid Digital Logbook backup file${detail ? ` (${detail})` : ""}.` });
  }

  try {
    const result = await prisma.$transaction((tx) => restore(tx, req.userId!, backup), IMPORT_TRANSACTION_OPTIONS);
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof ImportError) {
      return res.status(400).json({ error: `${error.message} Nothing was imported.` });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Two fields in one project whose names differ only by case, or a
      // project created under the same name while the import ran.
      return res.status(409).json({ error: "The backup clashes with a name that must be unique (a project, or a field within a project). Nothing was imported." });
    }
    console.error("Failed to import backup:", error);
    return res.status(500).json({ error: "The backup could not be imported. Nothing was imported, so it is safe to try again." });
  }
};
