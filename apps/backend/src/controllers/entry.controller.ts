import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { DATABASE_UNAVAILABLE, isDatabaseUnavailable } from "../utils/readRetry.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { createEntrySchema, updateEntrySchema } from "../schemas/entry.schema.js";
import type { Entry } from "@logbook/shared";
import { calculateComputedValues } from "../utils/computedFields.js";
import { cleanTagNames, resolveTagIds } from "../utils/tags.js";
import { validateEntryValues, findMissingRequiredField, isEmptyValue, findBadReference } from "../utils/entryValues.js";
import type { SnapshotField } from "../utils/entryFormat.js";
import { ensureBaselineVersion, recordVersion, sameSnapshot, toSnapshot } from "../utils/entryVersions.js";
import { dueDateOffsetDays, materializeDueRecurringEntries, nextRecurrenceDate } from "../utils/recurringEntries.js";
import { runEntryAutomation } from "../utils/automationRunner.js";


/**
 * Resolve a project the caller actually owns. requireAuth proves the caller
 * holds a valid token; it says nothing about whose project this is, so every
 * handler below must ask separately.
 *
 * Returns 404 rather than 403 for someone else's project, matching
 * project.controller.ts and declining to confirm that the id exists.
 */
async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

/** Resolve an entry the caller owns, reached through the owning project. */
export async function ownedEntry(entryId: string, userId: string) {
  return prisma.logbookEntry.findFirst({ where: { id: entryId, project: { userId } } });
}

/**
 * Saving an entry and its version is several round trips to Neon, and
 * Prisma's default 5s transaction limit has been exceeded on a slow
 * connection — failing an edit that was otherwise fine.
 */
export const ENTRY_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export const ENTRY_INCLUDE = {
  values: { include: { field: true } },
  formatVersion: true,
  tags: { include: { tag: true } },
  recurrenceRule: true,
} as const;

/**
 * Convert an array of EntryValue records (with included field) into a
 * flat Record keyed by fieldId, casting values to their declared types.
 */
function flattenValues(values: { fieldId: string; value: string; field: { type: string } }[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const ev of values) {
    if (ev.field.type === "NUMBER" || ev.field.type === "COMPUTED") {
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

function normalizeSnapshotField(field: any): SnapshotField {
  return {
    id: field.id,
    projectId: field.projectId,
    name: field.name,
    type: field.type,
    required: field.required,
    formula: field.formula,
    archivedAt: null,
    createdAt: field.createdAt?.toISOString?.() ?? field.createdAt,
    updatedAt: field.updatedAt?.toISOString?.() ?? field.updatedAt,
  };
}

/**
 * An entry's pinned format snapshot can miss a field two ways: a field added
 * to the project after the snapshot was taken and later filled in on this
 * entry, or a field since archived from the project that this entry still
 * holds a value for. Both are recovered here from the value's own `field`
 * relation, which always carries the real definition regardless of the
 * live project's current field list — so a dropped field never disappears
 * from an entry that already recorded it, and a newly added one appears as
 * soon as a value is saved for it, without ever repointing the entry at a
 * different snapshot (which would show *only* that snapshot's fields and
 * silently drop whichever of these two categories it didn't already have).
 */
function mergeEntryFields(snapshotFields: SnapshotField[], values: { fieldId: string; field: any }[]): SnapshotField[] {
  const known = new Set(snapshotFields.map((f) => f.id));
  const extra: SnapshotField[] = [];
  for (const v of values) {
    if (!known.has(v.fieldId)) {
      known.add(v.fieldId);
      extra.push(normalizeSnapshotField(v.field));
    }
  }
  return extra.length ? [...snapshotFields, ...extra] : snapshotFields;
}

/** Shape a Prisma LogbookEntry (with included values) into the API response. */
export function formatEntry(entry: {
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
  archivedAt?: Date | null;
  tags?: { tag: { name: string } }[];
  recurrenceRule?: { id: string; pattern: string; enabled: boolean; nextOccurrence: Date; until: Date | null } | null;
}): Entry {
  // Legacy entries predate snapshots entirely, so this starts from an empty
  // list rather than null — mergeEntryFields then derives their whole field
  // list from the retained fields referenced by their values, same as it
  // adds any extra field on top of a real snapshot.
  const snapshotFields = entry.formatVersion ? (entry.formatVersion.fields as SnapshotField[]) : [];
  const fields = mergeEntryFields(snapshotFields, entry.values);
  return {
    id: entry.id,
    projectId: entry.projectId,
    durationMinutes: entry.durationMinutes,
    entryDate: entry.entryDate?.toISOString() ?? null,
    dueDate: entry.dueDate?.toISOString() ?? null,
    values: flattenValues(entry.values),
    status: entry.status as "OPEN" | "DONE",
    completedAt: entry.completedAt?.toISOString() ?? null,
    archivedAt: entry.archivedAt?.toISOString() ?? null,
    recurrence: entry.recurrenceRule
      ? {
          id: entry.recurrenceRule.id,
          pattern: entry.recurrenceRule.pattern as "DAILY" | "WEEKLY" | "MONTHLY",
          enabled: entry.recurrenceRule.enabled,
          nextOccurrence: entry.recurrenceRule.nextOccurrence.toISOString(),
          until: entry.recurrenceRule.until?.toISOString() ?? null,
        }
      : null,
    tags: (entry.tags ?? []).map((t) => t.tag.name).sort(),
    format: fields.length ? { version: entry.formatVersion?.version ?? 0, fields: fields as any } : null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// Archived entries stay out of the normal logbook (US30): listings leave them
// out unless asked for them alone ("only") or alongside active ones ("include").
const ARCHIVED_FILTERS = ["exclude", "only", "include"];

function parseArchivedFilter(value: unknown): string | null {
  const filter = value === undefined || value === "" ? "exclude" : String(value).toLowerCase();
  return ARCHIVED_FILTERS.includes(filter) ? filter : null;
}

// ── GET /projects/:projectId/entries ─────────────────────────────────────

export const getEntries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }
    // Catching up recurring entries must never stop the logbook being read;
    // whatever is left is picked up by the next request or the timer.
    await materializeDueRecurringEntries(req.userId!).catch((error) =>
      console.error("Failed to generate recurring entries:", error)
    );
    const { status, dueBefore } = req.query;
    const archived = parseArchivedFilter(req.query.archived);
    if (!archived) {
      return res.status(400).json({ error: `archived must be one of ${ARCHIVED_FILTERS.join(", ")}` });
    }

    const where: any = { projectId };
    if (archived === "exclude") where.archivedAt = null;
    if (archived === "only") where.archivedAt = { not: null };
    if (status === "OPEN" || status === "DONE") where.status = status;
    if (dueBefore) where.dueDate = { lte: new Date(String(dueBefore)) };

    const entries = await prisma.logbookEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(entries.map(formatEntry));
  } catch (error) {
    console.error("Failed to fetch entries:", error);
    return res.status(500).json({ error: "Failed to fetch entries" });
  }
};

export const updateEntryStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    if (status !== "OPEN" && status !== "DONE") {
      return res.status(400).json({ error: "status must be OPEN or DONE" });
    }

    const owned = await ownedEntry(id, req.userId!);
    if (!owned) {
      return res.status(404).json({ error: "Entry not found" });
    }

    const entry = await prisma.$transaction(async (tx) => {
      const before = formatEntry(await tx.logbookEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE }));
      await ensureBaselineVersion(tx, before);
      const updated = formatEntry(await tx.logbookEntry.update({
        where: { id },
        data: {
          status,
          completedAt: status === "DONE" ? new Date() : null,
        },
        include: ENTRY_INCLUDE,
      }));
      if (!sameSnapshot(toSnapshot(before), toSnapshot(updated))) {
        await recordVersion(tx, id, toSnapshot(updated), "UPDATED");
      }
      return updated;
    }, ENTRY_TRANSACTION_OPTIONS);

    // A status change is a save, so ENTRY_UPDATED rules apply here too —
    // otherwise "when an entry is marked done" would depend on which of the
    // two endpoints the UI happened to use.
    const automated = await runEntryAutomation(id, owned.projectId, req.userId!, "ENTRY_UPDATED");

    return res.status(200).json(automated ?? entry);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Entry not found" });
    }
    console.error("Failed to update entry status:", error);
    return res.status(500).json({ error: "Failed to update entry status" });
  }
};

// ── POST /projects/:projectId/entries ────────────────────────────────────

export const createEntry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const validated = createEntrySchema.parse(req.body);

    const project = await ownedProject(projectId, req.userId!);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fields = await prisma.entryField.findMany({ where: { projectId, archivedAt: null } });
    const suppliedValues = Object.fromEntries(Object.entries(validated.values).filter(([fieldId]) => fields.find((field) => field.id === fieldId && field.type !== "COMPUTED")));

    const shapeError = validateEntryValues(fields, suppliedValues);
    if (shapeError) return res.status(400).json({ error: shapeError });

    const referenceError = await findBadReference(prisma, req.userId!, fields, suppliedValues);
    if (referenceError) return res.status(400).json({ error: referenceError });

    const computedValues = calculateComputedValues(fields, suppliedValues);

    const missing = findMissingRequiredField(fields, { ...suppliedValues, ...computedValues });
    if (missing) return res.status(400).json({ error: `"${missing.name}" is required.` });

    const latestFormat = await prisma.entryFormatVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    const tagNames = cleanTagNames(validated.tags);
    const tagIds = await resolveTagIds(prisma, project.userId, tagNames);
    const entry = await prisma.$transaction(async (tx) => {
      const recurrenceRule = validated.recurrence
        ? await tx.recurrenceRule.create({
            data: {
              projectId,
              pattern: validated.recurrence.pattern,
              until: validated.recurrence.until,
              nextOccurrence: nextRecurrenceDate(validated.entryDate ?? new Date(), validated.recurrence.pattern),
              durationMinutes: validated.durationMinutes,
              dueDateOffsetDays: dueDateOffsetDays(validated.entryDate ?? new Date(), validated.dueDate),
              values: { ...suppliedValues, ...computedValues } as Prisma.InputJsonValue,
              tags: tagNames,
              formatVersionId: latestFormat?.id,
            },
          })
        : null;
      const created = formatEntry(await tx.logbookEntry.create({
        data: {
          projectId,
          formatVersionId: latestFormat?.id,
          durationMinutes: validated.durationMinutes,
          entryDate: validated.entryDate,
          dueDate: validated.dueDate,
          recurrenceRuleId: recurrenceRule?.id,
          values: {
            // A field the user did not fill in gets no row at all. Writing ""
            // for it used to reach (mv.value)::numeric in the statistics
            // queries and fail the whole aggregation with 22P02 (BUG-012), and
            // it contradicted backfillNewField, which deliberately refuses to
            // fabricate a value for a field an entry never recorded.
            create: Object.entries({ ...suppliedValues, ...computedValues })
              .filter(([, value]) => !isEmptyValue(value))
              .map(([fieldId, value]) => ({
                fieldId,
                value: typeof value === "object" ? JSON.stringify(value) : String(value),
              })),
          },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: ENTRY_INCLUDE,
      }));
      // Version 1 is dated exactly when the entry was, so a historical view
      // at the moment of creation already finds it.
      await recordVersion(tx, created.id, toSnapshot(created), "CREATED", { createdAt: new Date(created.createdAt) });
      return created;
    }, ENTRY_TRANSACTION_OPTIONS);

    // US26. Deliberately after the commit above: the entry is the user's
    // work and must survive a broken rule, so automation can only ever add
    // to a save that has already succeeded. runEntryAutomation never throws
    // and returns null when nothing changed.
    const automated = await runEntryAutomation(entry.id, projectId, req.userId!, "ENTRY_CREATED");

    return res.status(201).json(automated ?? entry);
  } catch (error: any) {
    console.error("Failed to create entry:", error);
    if (isDatabaseUnavailable(error)) return res.status(503).json({ error: DATABASE_UNAVAILABLE });
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── PUT /entries/:id ─────────────────────────────────────────────────────

export const updateEntry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const validated = updateEntrySchema.parse(req.body);

    const existing = await prisma.logbookEntry.findFirst({
      where: { id, project: { userId: req.userId! } },
      include: { project: { select: { userId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Entry not found" });
    }

    const tagNames = validated.tags !== undefined ? cleanTagNames(validated.tags) : undefined;
    const tagIds =
      tagNames !== undefined ? await resolveTagIds(prisma, existing.project.userId, tagNames) : undefined;

    // An entry from before version history existed gets its pre-edit state
    // saved first, so this edit never overwrites the only copy. Done outside
    // the transaction to keep it short; saving the current state is harmless
    // even if the edit below then fails.
    const before = formatEntry(await prisma.logbookEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE }));
    await ensureBaselineVersion(prisma, before);

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

      if (validated.values) {
        const fields = await tx.entryField.findMany({ where: { projectId: existing.projectId, archivedAt: null } });

        const shapeError = validateEntryValues(fields, validated.values);
        if (shapeError) throw new Error(shapeError);

        const referenceError = await findBadReference(tx, req.userId!, fields, validated.values);
        if (referenceError) throw new Error(referenceError);

        const existingValues = await tx.entryValue.findMany({ where: { entryId: id } });
        const valueMap: Record<string, unknown> = Object.fromEntries(existingValues.map((value: any) => [value.fieldId, value.value]));
        Object.assign(valueMap, validated.values);
        const computedValues = calculateComputedValues(fields, valueMap);

        const missing = findMissingRequiredField(fields, { ...valueMap, ...computedValues });
        if (missing) throw new Error(`"${missing.name}" is required.`);

        for (const [fieldId, value] of Object.entries({ ...validated.values, ...computedValues })) {
          // Clearing a field removes its row rather than storing "". The
          // required-field check above already ran against the full value
          // map, so a required field cannot be emptied this way.
          if (isEmptyValue(value)) {
            await tx.entryValue.deleteMany({ where: { entryId: id, fieldId } });
            continue;
          }
          const stored = typeof value === "object" ? JSON.stringify(value) : String(value);
          await tx.entryValue.upsert({
            where: { entryId_fieldId: { entryId: id, fieldId } },
            create: { entryId: id, fieldId, value: stored },
            update: { value: stored },
          });
        }
      }

      if (Object.keys(entryData).length > 0) {
        await tx.logbookEntry.update({ where: { id }, data: entryData });
      }

      // Replace the tag set wholesale when tags are provided.
      if (tagIds !== undefined) {
        await tx.entryTag.deleteMany({ where: { entryId: id } });
        if (tagIds.length > 0) {
          await tx.entryTag.createMany({
            data: tagIds.map((tagId: string) => ({ entryId: id, tagId })),
          });
        }
      }

      const after = formatEntry(await tx.logbookEntry.findUnique({
        where: { id },
        include: ENTRY_INCLUDE,
      }));
      if (!sameSnapshot(toSnapshot(before), toSnapshot(after))) {
        await recordVersion(tx, id, toSnapshot(after), "UPDATED");
      }
      return after;
    }, ENTRY_TRANSACTION_OPTIONS);

    // US26 — "I save an entry". Same placement and same reasoning as create.
    const automated = await runEntryAutomation(id, existing.projectId, req.userId!, "ENTRY_UPDATED");

    return res.status(200).json(automated ?? entry);
  } catch (error: any) {
    console.error("Failed to update entry:", error);
    return res.status(400).json({ error: error.errors || error.message });
  }
};

// ── DELETE /entries/:id ──────────────────────────────────────────────────

export const deleteEntry = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await ownedEntry(id, req.userId!);
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

// ── GET /entries ─────────────────────────────────────────────────────────
// A user-scoped listing across every project, so a page showing entries
// from many projects needs one request rather than one per project.
//
// Scoped to req.userId from the first line and joined through the owning
// project: this endpoint never resolves an entry by id alone.

const DEFAULT_ENTRY_LIMIT = 200;
const MAX_ENTRY_LIMIT = 500;
const PROJECT_STATUSES = ["ACTIVE", "ARCHIVED", "ALL"];

/** Parse a YYYY-MM-DD or ISO date query param. Returns undefined when absent. */
function parseDateParam(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date`);
  return parsed;
}

export const listEntries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const projectStatus = String(req.query.projectStatus ?? "ALL").toUpperCase();
    if (!PROJECT_STATUSES.includes(projectStatus)) {
      return res.status(400).json({ error: `projectStatus must be one of ${PROJECT_STATUSES.join(", ")}` });
    }

    const rawLimit = req.query.limit === undefined ? DEFAULT_ENTRY_LIMIT : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      return res.status(400).json({ error: "limit must be a positive integer" });
    }
    const limit = Math.min(rawLimit, MAX_ENTRY_LIMIT);

    const rawOffset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(rawOffset) || rawOffset < 0) {
      return res.status(400).json({ error: "offset must be a non-negative integer" });
    }
    const offset = rawOffset;

    let from: Date | undefined;
    let to: Date | undefined;
    try {
      from = parseDateParam(req.query.from, "from");
      to = parseDateParam(req.query.to, "to");
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;

    const entryTab = String(req.query.entryTab ?? "all");
    if (!["all", "week", "overdue"].includes(entryTab)) {
      return res.status(400).json({ error: "entryTab must be all, week or overdue" });
    }

    const tagList = req.query.tags
      ? String(req.query.tags).split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const sort = String(req.query.sort ?? "newest");
    if (!["newest", "oldest"].includes(sort)) {
      return res.status(400).json({ error: "sort must be newest or oldest" });
    }

    const archivedFilter = String(req.query.archived ?? "exclude");
    if (!["exclude", "include", "only"].includes(archivedFilter)) {
      return res.status(400).json({ error: "archived must be exclude, include or only" });
    }

    type FieldFilter = { fieldId: string; op: string; value: string };
    let fieldFilters: FieldFilter[] = [];
    if (req.query.filters) {
      try {
        const parsed = JSON.parse(String(req.query.filters));
        if (!Array.isArray(parsed)) throw new Error("filters must be an array");
        fieldFilters = parsed;
      } catch (error: any) {
        return res.status(400).json({ error: `filters must be valid JSON: ${error.message}` });
      }
    }

    // ── Shared WHERE clause ─────────────────────────────────────────────
    const conditions: Prisma.Sql[] = [Prisma.sql`p.user_id = ${userId}::uuid`];
    if (projectId) conditions.push(Prisma.sql`le.project_id = ${projectId}::uuid`);
    if (projectStatus !== "ALL") conditions.push(Prisma.sql`p.status::text = ${projectStatus}`);
    if (archivedFilter === "exclude") conditions.push(Prisma.sql`le.archived_at IS NULL`);
    else if (archivedFilter === "only") conditions.push(Prisma.sql`le.archived_at IS NOT NULL`);
    if (from) conditions.push(Prisma.sql`COALESCE(le.entry_date, le.created_at) >= ${from}`);
    if (to) conditions.push(Prisma.sql`COALESCE(le.entry_date, le.created_at) <= ${to}`);

    if (entryTab === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      conditions.push(Prisma.sql`COALESCE(le.entry_date, le.created_at) >= ${weekAgo}`);
    } else if (entryTab === "overdue") {
      const today = new Date(new Date().toDateString());
      conditions.push(Prisma.sql`le.status = 'OPEN'`);
      conditions.push(Prisma.sql`le.due_date IS NOT NULL AND le.due_date < ${today}`);
    }

    if (tagList.length > 0) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1 FROM entry_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.entry_id = le.id AND t.name = ANY(${tagList}::text[])
        )
      `);
    }

    if (search) {
      const like = `%${search}%`;
      conditions.push(Prisma.sql`
        (
          p.name ILIKE ${like}
          OR EXISTS (SELECT 1 FROM entry_values ev WHERE ev.entry_id = le.id AND ev.value ILIKE ${like})
          OR EXISTS (
            SELECT 1 FROM entry_tags et
            JOIN tags t ON t.id = et.tag_id
            WHERE et.entry_id = le.id AND t.name ILIKE ${like}
          )
        )
      `);
    }

    for (const filter of fieldFilters) {
      if (!filter || typeof filter.fieldId !== "string" || typeof filter.op !== "string" || typeof filter.value !== "string") {
        return res.status(400).json({ error: "each filter needs fieldId, op and value" });
      }

      const field = await prisma.entryField.findFirst({
        where: { id: filter.fieldId, project: { userId } },
        select: { id: true, type: true },
      });
      if (!field) {
        return res.status(400).json({ error: `unknown field: ${filter.fieldId}` });
      }

      const base = Prisma.sql`ev.entry_id = le.id AND ev.field_id = ${filter.fieldId}::uuid`;
      let clause: Prisma.Sql;
      switch (`${field.type}:${filter.op}`) {
        case "TEXT:contains":
          clause = Prisma.sql`${base} AND ev.value ILIKE ${"%" + filter.value + "%"}`;
          break;
        case "TEXT:equals":
          clause = Prisma.sql`${base} AND LOWER(ev.value) = LOWER(${filter.value})`;
          break;
        case "NUMBER:equals":
        case "NUMBER:gt":
        case "NUMBER:lt": {
          const num = Number(filter.value);
          if (!Number.isFinite(num)) return res.status(400).json({ error: `value must be a number for ${field.type}` });
          if (filter.op === "equals") clause = Prisma.sql`${base} AND (ev.value)::numeric = ${num}`;
          else if (filter.op === "gt") clause = Prisma.sql`${base} AND (ev.value)::numeric > ${num}`;
          else clause = Prisma.sql`${base} AND (ev.value)::numeric < ${num}`;
          break;
        }
        case "BOOLEAN:is_true":
          clause = Prisma.sql`${base} AND ev.value = 'true'`;
          break;
        case "BOOLEAN:is_false":
          clause = Prisma.sql`${base} AND ev.value = 'false'`;
          break;
        case "DATE:on":
        case "DATE:before":
        case "DATE:after": {
          if (filter.op === "on") clause = Prisma.sql`${base} AND ev.value::date = ${filter.value}::date`;
          else if (filter.op === "before") clause = Prisma.sql`${base} AND ev.value::date < ${filter.value}::date`;
          else clause = Prisma.sql`${base} AND ev.value::date > ${filter.value}::date`;
          break;
        }
        case "TAGS:has_tag":
          clause = Prisma.sql`${base} AND ev.value::jsonb ? ${filter.value}`;
          break;
        default:
          return res.status(400).json({ error: `unsupported operation ${filter.op} for ${field.type}` });
      }
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM entry_values ev WHERE ${clause})`);
    }

    const whereClause = Prisma.join(conditions, " AND ");

    // ── Relevance scoring (US25) ────────────────────────────────────────
    // When a search term is present, rank by how strongly each entry matches
    // before falling back to date order. Weights:
    //   project name match        → 3
    //   TEXT field value match    → 3
    //   TAGS field value match    → 2
    //   any other field value     → 1
    // An entry scores the sum of its matches; the more places the term
    // appears, the higher it ranks.
    const relevanceSql = search
      ? Prisma.sql`
          (
            CASE WHEN p.name ILIKE ${"%" + search + "%"} THEN 3 ELSE 0 END
            + COALESCE((
              SELECT SUM(
                CASE
                  WHEN ef.type = 'TEXT' THEN 3
                  WHEN ef.type = 'TAGS' THEN 2
                  ELSE 1
                END
              )
              FROM entry_values ev
              JOIN entry_fields ef ON ef.id = ev.field_id
              WHERE ev.entry_id = le.id AND ev.value ILIKE ${"%" + search + "%"}
            ), 0)
            + COALESCE((
              SELECT COUNT(*) * 2
              FROM entry_tags et
              JOIN tags t ON t.id = et.tag_id
              WHERE et.entry_id = le.id AND t.name ILIKE ${"%" + search + "%"}
            ), 0)
          )::int AS relevance
        `
      : Prisma.sql`0::int AS relevance`;

    // Order: when searching, most relevant first then newest. Without a
    // search, keep the plain date order.
    const orderSql = search
      ? Prisma.sql`ORDER BY relevance DESC, COALESCE(le.entry_date, le.created_at) DESC, le.id DESC`
      : sort === "oldest"
        ? Prisma.sql`ORDER BY COALESCE(le.entry_date, le.created_at) ASC, le.id ASC`
        : Prisma.sql`ORDER BY COALESCE(le.entry_date, le.created_at) DESC, le.id DESC`;

    // ── Page query ──────────────────────────────────────────────────────
    const rows = await prisma.$queryRaw<{ id: string; relevance: number }[]>`
      SELECT le.id, ${relevanceSql}
      FROM logbook_entries le
      JOIN projects p ON p.id = le.project_id
      WHERE ${whereClause}
      ${orderSql}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // ── Stats over the whole filtered set ───────────────────────────────
    const statRows = await prisma.$queryRaw<{
      total: bigint;
      week_count: bigint;
      week_minutes: bigint;
      overdue_count: bigint;
    }[]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (
          WHERE COALESCE(le.entry_date, le.created_at) >= NOW() - INTERVAL '7 days'
        )::bigint AS week_count,
        COALESCE(SUM(le.duration_minutes) FILTER (
          WHERE COALESCE(le.entry_date, le.created_at) >= NOW() - INTERVAL '7 days'
        ), 0)::bigint AS week_minutes,
        COUNT(*) FILTER (
          WHERE le.status = 'OPEN' AND le.due_date IS NOT NULL AND le.due_date < CURRENT_DATE
        )::bigint AS overdue_count
      FROM logbook_entries le
      JOIN projects p ON p.id = le.project_id
      WHERE ${whereClause}
    `;

    const dayRows = await prisma.$queryRaw<{ day: string }[]>`
      SELECT DISTINCT to_char(COALESCE(le.entry_date, le.created_at), 'YYYY-MM-DD') AS day
      FROM logbook_entries le
      JOIN projects p ON p.id = le.project_id
      WHERE ${whereClause}
      ORDER BY day DESC
    `;

    const stat = statRows[0] ?? { total: BigInt(0), week_count: BigInt(0), week_minutes: BigInt(0), overdue_count: BigInt(0) };
    const stats = {
      total: Number(stat.total),
      weekCount: Number(stat.week_count),
      weekMinutes: Number(stat.week_minutes),
      overdueCount: Number(stat.overdue_count),
      streak: computeStreakFromDays(dayRows.map((r) => r.day)),
    };

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return res.status(200).json({ entries: [], formats: {}, limit, offset, truncated: false, stats });
    }

    const found = await prisma.logbookEntry.findMany({
      where: { id: { in: ids } },
      include: ENTRY_INCLUDE,
    });
    const byId = new Map(found.map((e) => [e.id, e]));
    const ordered = ids.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));

    const formats: Record<string, { version: number; fields: unknown }> = {};
    const entries = ordered.map((entry) => {
      const { format, ...rest } = formatEntry(entry);
      const snapshotFields = entry.formatVersion ? (entry.formatVersion.fields as unknown as SnapshotField[]) : [];
      const usesExtraFields = format !== null && format.fields.length !== snapshotFields.length;
      const formatKey = usesExtraFields ? `entry:${entry.id}` : entry.formatVersionId;
      if (formatKey && format) {
        formats[formatKey] = { version: format.version, fields: format.fields };
      }
      return { ...rest, formatVersionId: formatKey };
    });

    return res.status(200).json({
      entries,
      formats,
      limit,
      offset,
      truncated: ids.length === limit,
      stats,
    });
  } catch (error) {
    console.error("Failed to list entries:", error);
    return res.status(500).json({ error: "Failed to list entries" });
  }
};

export const getOpenEntries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Open work is the list that accumulates fastest, so it is paged on the
    // same terms as GET /entries: an explicit limit, capped, plus an offset.
    const rawLimit = req.query.limit === undefined ? DEFAULT_ENTRY_LIMIT : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      return res.status(400).json({ error: "limit must be a positive integer" });
    }
    const limit = Math.min(rawLimit, MAX_ENTRY_LIMIT);

    const rawOffset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(rawOffset) || rawOffset < 0) {
      return res.status(400).json({ error: "offset must be a non-negative integer" });
    }
    const offset = rawOffset;

    // Find the user's projects, then all their OPEN entries in one query.
    const entries = await prisma.logbookEntry.findMany({
      where: {
        status: "OPEN",
        // Archived work is out of the way by design (US32), so it is not
        // listed as work still to do.
        archivedAt: null,
        project: { userId },
      },
      include: {
        values: { include: { field: true } },
        formatVersion: true,
        project: { select: { id: true, name: true } },
      },
      // Most urgent first, undated last. The page groups by due date, so a
      // truncated tail loses the items with the least claim on the reader's
      // attention rather than, say, this morning's overdue work.
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
    });

    const shaped = entries.map((entry) => ({
      ...formatEntry(entry),
      projectName: entry.project.name,
    }));

    return res.status(200).json({
      entries: shaped,
      limit,
      offset,
      truncated: shaped.length === limit,
    });
  } catch (error) {
    console.error("Failed to fetch open entries:", error);
    return res.status(500).json({ error: "Failed to fetch open entries" });
  }
};

/** Streak from an ordered list of YYYY-MM-DD strings (newest first). */
function computeStreakFromDays(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  // Days come from the database as UTC dates, so count in UTC too: local
  // midnight read back through toISOString() lands on the previous day
  // anywhere east of UTC, which dropped today from the streak.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Allow the streak to start today or yesterday.
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  let cursor: Date;
  if (set.has(todayKey)) cursor = today;
  else if (set.has(yesterdayKey)) cursor = yesterday;
  else return 0;

  let streak = 0;
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
