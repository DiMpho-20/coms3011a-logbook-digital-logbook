import { Response } from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import type { EntryAtDate, EntryHistory, EntryVersion } from "@logbook/shared";
import { ENTRY_INCLUDE, ENTRY_TRANSACTION_OPTIONS, formatEntry } from "./entry.controller.js";
import {
  ensureBaselineVersion,
  recordVersion,
  toApiVersion,
  toSnapshot,
  versionAt,
} from "../utils/entryVersions.js";
import { isEmptyValue } from "../utils/entryValues.js";
import { cleanTagNames, resolveTagIds } from "../utils/tags.js";

/**
 * The caller's entry with its full version history, oldest first. An entry
 * from before history existed has no stored versions; its current state is
 * presented as version 1 (dated from creation) until its first change saves
 * that for real — see ensureBaselineVersion.
 */
async function loadHistory(entryId: string, userId: string) {
  const entry = await prisma.logbookEntry.findFirst({
    where: { id: entryId, project: { userId } },
    include: { ...ENTRY_INCLUDE, versions: { orderBy: { version: "asc" } }, project: { select: { userId: true } } },
  });
  if (!entry) return null;

  const current = formatEntry(entry);
  const versions: EntryVersion[] = entry.versions.length
    ? entry.versions.map(toApiVersion)
    : [{ version: 1, reason: "CREATED", restoredFromVersion: null, createdAt: current.createdAt, snapshot: toSnapshot(current) }];

  return { entry, current, versions };
}

// ── GET /entries/:id/versions ────────────────────────────────────────────

export const getEntryVersions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await loadHistory(String(req.params.id), req.userId!);
    if (!history) return res.status(404).json({ error: "Entry not found" });

    return res.status(200).json({
      entryId: history.current.id,
      entryCreatedAt: history.current.createdAt,
      currentVersion: history.versions[history.versions.length - 1].version,
      versions: history.versions,
    } satisfies EntryHistory);
  } catch (error) {
    console.error("Failed to fetch entry versions:", error);
    return res.status(500).json({ error: "Failed to fetch entry versions" });
  }
};

// ── GET /entries/:id/versions/at?date=ISO ────────────────────────────────

export const getEntryVersionAt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const at = new Date(String(req.query.date ?? ""));
    if (!req.query.date || Number.isNaN(at.getTime())) {
      return res.status(400).json({ error: "date must be a valid date" });
    }

    const history = await loadHistory(String(req.params.id), req.userId!);
    if (!history) return res.status(404).json({ error: "Entry not found" });

    const entryCreatedAt = history.current.createdAt;
    if (at.getTime() < new Date(entryCreatedAt).getTime()) {
      return res.status(200).json({ existed: false, entryCreatedAt } satisfies EntryAtDate);
    }

    // The entry existed by then, so some version applies; the first one is
    // the fallback only if a version's timestamp trails the entry's by a hair.
    const version = versionAt(history.versions, at) ?? history.versions[0];
    const latest = history.versions[history.versions.length - 1];
    return res.status(200).json({
      existed: true,
      entryCreatedAt,
      version,
      isCurrent: version.version === latest.version,
    } satisfies EntryAtDate);
  } catch (error) {
    console.error("Failed to fetch entry version at date:", error);
    return res.status(500).json({ error: "Failed to fetch entry version" });
  }
};

// ── POST /entries/:id/versions/:version/restore ──────────────────────────

export const restoreEntryVersion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const versionNumber = Number(req.params.version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return res.status(400).json({ error: "version must be a positive whole number" });
    }

    const history = await loadHistory(id, req.userId!);
    if (!history) return res.status(404).json({ error: "Entry not found" });

    const target = history.versions.find((v) => v.version === versionNumber);
    if (!target) return res.status(404).json({ error: "Version not found" });

    const snapshot = target.snapshot;
    const tagIds = await resolveTagIds(prisma, history.entry.project.userId, cleanTagNames(snapshot.tags));

    // A value can only come back for a field the project still has; one
    // deleted outright since then has nowhere to be stored.
    const snapshotFieldIds = Object.keys(snapshot.values ?? {});
    const liveFields = await prisma.entryField.findMany({
      where: { projectId: history.entry.projectId, id: { in: snapshotFieldIds } },
      select: { id: true },
    });
    const live = new Set(liveFields.map((f) => f.id));

    const result = await prisma.$transaction(async (tx) => {
      // Keep the state being replaced: restoring must never cost a version.
      await ensureBaselineVersion(tx, history.current);

      await tx.entryValue.deleteMany({ where: { entryId: id } });
      const rows = Object.entries(snapshot.values ?? {})
        .filter(([fieldId, value]) => live.has(fieldId) && !isEmptyValue(value))
        .map(([fieldId, value]) => ({
          entryId: id,
          fieldId,
          value: typeof value === "object" ? JSON.stringify(value) : String(value),
        }));
      if (rows.length > 0) await tx.entryValue.createMany({ data: rows });

      await tx.logbookEntry.update({
        where: { id },
        data: {
          durationMinutes: snapshot.durationMinutes,
          entryDate: snapshot.entryDate ? new Date(snapshot.entryDate) : null,
          dueDate: snapshot.dueDate ? new Date(snapshot.dueDate) : null,
          status: snapshot.status,
          completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null,
        },
      });

      await tx.entryTag.deleteMany({ where: { entryId: id } });
      if (tagIds.length > 0) {
        await tx.entryTag.createMany({ data: tagIds.map((tagId) => ({ entryId: id, tagId })) });
      }

      const restored = formatEntry(await tx.logbookEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE }));
      const row = await recordVersion(tx, id, toSnapshot(restored), "RESTORED", { restoredFromVersion: versionNumber });
      return { entry: restored, version: toApiVersion(row) };
    }, ENTRY_TRANSACTION_OPTIONS);

    return res.status(200).json({
      ...result,
      skippedFields: snapshotFieldIds.filter((fieldId) => !live.has(fieldId)).length,
    });
  } catch (error) {
    console.error("Failed to restore entry version:", error);
    return res.status(500).json({ error: "Failed to restore entry version" });
  }
};

// ── PATCH /entries/:id/archive ───────────────────────────────────────────

const archiveOneSchema = z.object({ archived: z.boolean() });

export const setEntryArchived = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = archiveOneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "archived must be true or false" });

    const existing = await prisma.logbookEntry.findFirst({ where: { id, project: { userId: req.userId! } } });
    if (!existing) return res.status(404).json({ error: "Entry not found" });

    const entry = await prisma.logbookEntry.update({
      where: { id },
      // Archiving again keeps the original archive date.
      data: { archivedAt: parsed.data.archived ? existing.archivedAt ?? new Date() : null },
      include: ENTRY_INCLUDE,
    });
    return res.status(200).json(formatEntry(entry));
  } catch (error) {
    console.error("Failed to archive entry:", error);
    return res.status(500).json({ error: "Failed to archive entry" });
  }
};

// ── POST /entries/archive ────────────────────────────────────────────────
// Archive (or restore) several selected entries at once.

const archiveManySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  archived: z.boolean(),
});

export const archiveEntries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = archiveManySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Send ids (a list of entry ids) and archived (true or false)" });
    }
    const { ids, archived } = parsed.data;

    // Scoped through the owning project, so ids belonging to someone else
    // are silently left alone rather than confirmed to exist.
    const result = await prisma.logbookEntry.updateMany({
      where: {
        id: { in: ids },
        project: { userId: req.userId! },
        archivedAt: archived ? null : { not: null },
      },
      data: { archivedAt: archived ? new Date() : null },
    });
    return res.status(200).json({ updated: result.count });
  } catch (error) {
    console.error("Failed to archive entries:", error);
    return res.status(500).json({ error: "Failed to archive entries" });
  }
};
