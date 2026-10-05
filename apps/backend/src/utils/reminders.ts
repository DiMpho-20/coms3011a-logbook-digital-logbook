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
  assessmentEnabled: true,
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
  assessmentId?: string | null;
  title: string;
}

// ── Assessments (FEAT-009) ────────────────────────────────────────────────
// Two reminders per dated assessment rather than one a day: the first gives
// time to prepare, the second is close to the day. Each is a separate
// condition, so each is pushed once.

/** Days before an assessment's date that each reminder starts, earliest first. */
export const ASSESSMENT_MILESTONES = [5, 2] as const;

/** New assessment reminders wait for this time of the student's day, so no push arrives overnight. */
export const ASSESSMENT_REMINDER_TIME = "08:00";

/**
 * Which reminder covers an assessment `days` away: the 5-day one from 5 to 3
 * days before, the 2-day one from 2 days before until the day itself.
 */
export function assessmentMilestone(days: number): number | null {
  if (days < 0) return null;
  const covering = ASSESSMENT_MILESTONES.filter((milestone) => days <= milestone);
  return covering.length > 0 ? Math.min(...covering) : null;
}

/** "Sun 15 Nov": a DATE column is midnight UTC, so it is read in UTC. */
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Titles name the date rather than counting down to it: a title is fixed when
 * the reminder is made, and "in 5 days" would be wrong the next morning.
 */
export function assessmentReminderTitle(assessment: {
  name: string;
  date: Date;
  dateKind: "DUE" | "TEST" | null;
  module: { code: string };
}): string {
  const day = SHORT_DAY.format(assessment.date);
  const what = `${assessment.module.code} ${assessment.name}`;
  const title = assessment.dateKind === "TEST" ? `Test on ${day}: ${what}` : `Due ${day}: ${what}`;
  return title.length > 255 ? `${title.slice(0, 252)}...` : title;
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

  // Reminders that still apply but may not be created yet (before 08:00). The
  // cleanup below must leave these alone, or one made yesterday would be
  // deleted overnight and made — and pushed — again in the morning.
  const held: string[] = [];
  if (rules.assessmentEnabled) {
    const from = new Date(`${today.date}T00:00:00.000Z`);
    const to = new Date(from.getTime() + ASSESSMENT_MILESTONES[0] * DAY_MS);
    const dated = await prisma.assessment.findMany({
      where: {
        module: { userId },
        remind: true,
        // Not yet marked or missed.
        missed: false,
        markObtained: null,
        markPercent: null,
        date: { gte: from, lte: to },
      },
      select: { id: true, name: true, date: true, dateKind: true, module: { select: { code: true } } },
    });
    const timeHasCome = today.minutes >= timeToMinutes(ASSESSMENT_REMINDER_TIME);
    for (const assessment of dated) {
      const day = assessment.date!.toISOString().slice(0, 10);
      const milestone = assessmentMilestone(daysBetween(today.date, day));
      if (milestone === null) continue;
      const ruleKey = `assessment:${assessment.id}:${day}:${milestone}`;
      if (!timeHasCome) {
        held.push(ruleKey);
        continue;
      }
      candidates.push({
        ruleKey,
        source: "ASSESSMENT",
        entryId: null,
        assessmentId: assessment.id,
        title: assessmentReminderTitle({ ...assessment, date: assessment.date! }),
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
  // anything else simply no longer applies. For an assessment, being marked
  // (or missed) is finishing it; a moved or passed date is not.
  const valid = new Set([...candidates.map((c) => c.ruleKey), ...held]);
  const pending = await prisma.reminder.findMany({
    where: { userId, status: "PENDING", source: { not: "MANUAL" } },
    select: {
      id: true,
      ruleKey: true,
      source: true,
      entry: { select: { status: true } },
      assessment: { select: { missed: true, markObtained: true, markPercent: true } },
    },
  });
  const lapsed = pending.filter((r) => !valid.has(r.ruleKey!));
  const finished = lapsed.filter((r) =>
    r.entry?.status === "DONE" ||
    (r.source === "DAILY_LOG" && r.ruleKey === `daily-log:${today.date}` && loggedToday) ||
    (r.assessment !== null && (r.assessment.missed || r.assessment.markObtained !== null || r.assessment.markPercent !== null))
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
