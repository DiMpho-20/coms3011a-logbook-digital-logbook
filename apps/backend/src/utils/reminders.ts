import prisma from "../prisma.js";
import type { ReminderSettings, ReminderSource } from "@prisma/client";

const DAY_MS = 86_400_000;

/** The rules a student has before they change anything. */
export const DEFAULT_REMINDER_SETTINGS = {
  dueSoonEnabled: true,
  dueSoonDays: 1,
  overdueEnabled: true,
  staleEnabled: false,
  staleDays: 7,
  dailyLogEnabled: false,
  dailyLogTime: "18:00",
  timeZone: "UTC",
};

export type ReminderRules = Omit<ReminderSettings, "userId" | "updatedAt">;

export async function getReminderSettings(userId: string): Promise<ReminderRules> {
  const row = await prisma.reminderSettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_REMINDER_SETTINGS };
  return Object.fromEntries(
    Object.keys(DEFAULT_REMINDER_SETTINGS).map((key) => [key, row[key as keyof ReminderRules]])
  ) as ReminderRules;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar date ("YYYY-MM-DD") and minutes past midnight that `now` reads
 * as on a wall clock in `timeZone`. A day like "due today" only means
 * something in the student's own zone, not the server's.
 */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Whole days from one "YYYY-MM-DD" date to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** "HH:MM" as minutes past midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Entries have no title of their own, so a reminder names one by its first
 * non-empty text field — the same thing the dashboard shows — falling back to
 * the project it belongs to.
 */
export function entryLabel(entry: { values: { value: string }[]; project: { name: string } }): string {
  const text = entry.values.map((v) => v.value.trim()).find(Boolean);
  const label = text ?? `Entry in ${entry.project.name}`;
  return label.length > 120 ? `${label.slice(0, 117)}...` : label;
}

/** Just enough of an entry to name it: its text values, in field order. */
export const ENTRY_LABEL_INCLUDE = {
  project: { select: { name: true } },
  values: {
    where: { field: { type: "TEXT" as const } },
    orderBy: { field: { createdAt: "asc" as const } },
    select: { value: true },
  },
};

interface Candidate {
  ruleKey: string;
  source: ReminderSource;
  entryId: string | null;
  title: string;
}

/**
 * Evaluate the student's reminder rules against their entries as they stand
 * at `now`, create a reminder for every condition that has been reached, and
 * tidy up generated reminders whose condition no longer holds.
 *
 * Each condition has a stable ruleKey, and (userId, ruleKey) is unique, so
 * running this repeatedly — or concurrently — never duplicates a reminder,
 * and one the student has completed or dismissed stays that way.
 */
export async function generateReminders(userId: string, now: Date = new Date()): Promise<void> {
  const rules = await getReminderSettings(userId);
  const today = localClock(now, rules.timeZone);
  const candidates: Candidate[] = [];
  const openEntry = { project: { userId }, status: "OPEN" as const, archivedAt: null };

  if (rules.dueSoonEnabled || rules.overdueEnabled) {
    // A day of slack on the horizon covers any time zone; the exact
    // cut-off is applied below on calendar dates.
    const horizon = new Date(now.getTime() + ((rules.dueSoonEnabled ? rules.dueSoonDays : 0) + 1) * DAY_MS);
    const dated = await prisma.logbookEntry.findMany({
      where: { ...openEntry, dueDate: { not: null, lte: horizon } },
      include: ENTRY_LABEL_INCLUDE,
    });
    for (const entry of dated) {
      // The frontend treats a due date as a calendar day, so do the same.
      const dueDay = entry.dueDate!.toISOString().slice(0, 10);
      const days = daysBetween(today.date, dueDay);
      if (days < 0 && rules.overdueEnabled) {
        candidates.push({
          ruleKey: `overdue:${entry.id}:${dueDay}`,
          source: "OVERDUE",
          entryId: entry.id,
          title: `Overdue: ${entryLabel(entry)}`,
        });
      } else if (days >= 0 && days <= rules.dueSoonDays && rules.dueSoonEnabled) {
        candidates.push({
          ruleKey: `due-soon:${entry.id}:${dueDay}`,
          source: "DUE_SOON",
          entryId: entry.id,
          title: `Due soon: ${entryLabel(entry)}`,
        });
      }
    }
  }

  if (rules.staleEnabled) {
    const stale = await prisma.logbookEntry.findMany({
      where: { ...openEntry, updatedAt: { lt: new Date(now.getTime() - rules.staleDays * DAY_MS) } },
      include: ENTRY_LABEL_INCLUDE,
    });
    for (const entry of stale) {
      // Keyed on the last edit, so working on the entry and then leaving it
      // again is a fresh condition rather than the one already dismissed.
      candidates.push({
        ruleKey: `stale:${entry.id}:${entry.updatedAt.toISOString()}`,
        source: "STALE",
        entryId: entry.id,
        title: `No progress in ${rules.staleDays} days: ${entryLabel(entry)}`,
      });
    }
  }

  let loggedToday = false;
  if (rules.dailyLogEnabled) {
    const recent = await prisma.logbookEntry.findMany({
      where: { project: { userId }, createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } },
      select: { createdAt: true },
    });
    loggedToday = recent.some((e) => localClock(e.createdAt, rules.timeZone).date === today.date);
    if (!loggedToday && today.minutes >= timeToMinutes(rules.dailyLogTime)) {
      candidates.push({
        ruleKey: `daily-log:${today.date}`,
        source: "DAILY_LOG",
        entryId: null,
        title: "Log today's work",
      });
    }
  }

  if (candidates.length > 0) {
    await prisma.reminder.createMany({
      data: candidates.map((c) => ({ ...c, userId, remindAt: now })),
      skipDuplicates: true,
    });
  }

  // Generated reminders still pending whose condition has lapsed: the entry
  // was finished, its due date moved, it was archived, or the rule was
  // switched off. Finished work counts as the reminder being completed;
  // anything else simply no longer applies.
  const valid = new Set(candidates.map((c) => c.ruleKey));
  const pending = await prisma.reminder.findMany({
    where: { userId, status: "PENDING", source: { not: "MANUAL" } },
    select: { id: true, ruleKey: true, source: true, entry: { select: { status: true } } },
  });
  const lapsed = pending.filter((r) => !valid.has(r.ruleKey!));
  const finished = lapsed.filter((r) =>
    r.entry?.status === "DONE" || (r.source === "DAILY_LOG" && r.ruleKey === `daily-log:${today.date}` && loggedToday)
  );
  const finishedIds = new Set(finished.map((r) => r.id));
  const obsolete = lapsed.filter((r) => !finishedIds.has(r.id));

  if (finished.length > 0) {
    await prisma.reminder.updateMany({
      where: { id: { in: [...finishedIds] }, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: now },
    });
  }
  if (obsolete.length > 0) {
    await prisma.reminder.deleteMany({ where: { id: { in: obsolete.map((r) => r.id) }, status: "PENDING" } });
  }
}
