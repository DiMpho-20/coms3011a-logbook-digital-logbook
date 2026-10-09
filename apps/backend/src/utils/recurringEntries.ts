import prisma from "../prisma.js";
import { isEmptyValue } from "./entryValues.js";
import { resolveTagIds } from "./tags.js";
import { recordVersion, toSnapshot } from "./entryVersions.js";
import { ENTRY_INCLUDE, formatEntry } from "../controllers/entry.controller.js";

type Pattern = "DAILY" | "WEEKLY" | "MONTHLY";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Advance a calendar date without turning 31 January into a day in March. */
export function nextRecurrenceDate(date: Date, pattern: Pattern): Date {
  const next = new Date(date);
  if (pattern === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  if (pattern === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  if (pattern === "MONTHLY") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

export function dueDateOffsetDays(entryDate: Date, dueDate?: Date): number | null {
  return dueDate ? Math.round((dueDate.getTime() - entryDate.getTime()) / DAY_MS) : null;
}

/**
 * Materialise all occurrences that are due. This is deliberately idempotent:
 * each occurrence is claimed by advancing the rule's nextOccurrence in the
 * same transaction as its entry, so overlapping workers never duplicate one.
 *
 * Each occurrence is its own transaction. A rule several weeks behind used to
 * be caught up in one transaction that ran past Prisma's timeout, rolled back,
 * and so never caught up — failing every read of the project's entries.
 */
export async function materializeDueRecurringEntries(userId?: string, now = new Date()) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      enabled: true,
      nextOccurrence: { lte: now },
      ...(userId ? { project: { userId } } : {}),
    },
    select: { id: true },
  });

  for (const { id } of rules) {
    while (await materializeNextOccurrence(id, now)) {
      // Keep going until the rule is no longer due.
    }
  }
}

/** Create the rule's next due occurrence, if any; true when one was created. */
async function materializeNextOccurrence(id: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction. A different request may have already
    // generated the due row after the outer query was made.
    const rule = await tx.recurrenceRule.findUnique({
      where: { id },
      include: { project: { select: { userId: true, status: true } } },
    });
    if (!rule || !rule.enabled || rule.project.status !== "ACTIVE") return false;

    const occurrence = rule.nextOccurrence;
    if (occurrence > now) return false;
    if (rule.until && occurrence > rule.until) {
      await tx.recurrenceRule.update({ where: { id: rule.id }, data: { enabled: false } });
      return false;
    }

    // Claim this occurrence before creating it. Moving nextOccurrence on only
    // where it still holds the value read above makes Postgres serialise
    // concurrent workers (the timer, page requests, another instance): the
    // loser's update matches no row and it creates nothing. Without the claim,
    // each worker created the same occurrence.
    const next = nextRecurrenceDate(occurrence, rule.pattern);
    const claimed = await tx.recurrenceRule.updateMany({
      where: { id: rule.id, enabled: true, nextOccurrence: occurrence },
      data: {
        nextOccurrence: next,
        // A finite pattern becomes disabled after its final occurrence.
        enabled: !rule.until || next <= rule.until,
      },
    });
    if (claimed.count === 0) return false;

    const values = rule.values as Record<string, unknown>;
    const tagIds = await resolveTagIds(tx, rule.project.userId, rule.tags);
    const created = formatEntry(await tx.logbookEntry.create({
      data: {
        projectId: rule.projectId,
        recurrenceRuleId: rule.id,
        formatVersionId: rule.formatVersionId,
        durationMinutes: rule.durationMinutes,
        entryDate: occurrence,
        dueDate: rule.dueDateOffsetDays === null ? undefined : new Date(occurrence.getTime() + rule.dueDateOffsetDays * DAY_MS),
        values: {
          create: Object.entries(values)
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
    await recordVersion(tx, created.id, toSnapshot(created), "CREATED", { createdAt: occurrence });
    return true;
  }, { timeout: 20_000 });
}
