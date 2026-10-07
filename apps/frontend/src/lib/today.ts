import type { Entry, GradeModule, Reminder } from "@logbook/shared";
import { formatRequired, formatWeight, type ModuleSummary } from "./grades";
import { awaitingMark, daysUntil, upcomingAssessments } from "./gradeDisplay";
import { localDateKey } from "./utils";

/**
 * The dashboard's "today" view: what's coming up, and the few things worth
 * knowing right now. It only arranges data the app already has; every grade
 * figure and status comes from the grade engine's summaries, unchanged.
 *
 * Next up holds dated things. On your radar holds things that need a nudge
 * but have no date of their own, so the two never repeat each other.
 */

export type NextUpKind = "TEST" | "DUE" | "ENTRY_DUE" | "REMINDER";

export interface NextUpItem {
  id: string;
  kind: NextUpKind;
  title: string;
  /** Module code, project name, or nothing for a reminder. */
  context: string | null;
  /** The calendar day, "YYYY-MM-DD". */
  day: string;
  /** Days from today (0 = today). */
  days: number;
  href: string;
}

const KIND_ORDER: Record<NextUpKind, number> = { TEST: 0, DUE: 1, ENTRY_DUE: 2, REMINDER: 3 };

/** How far ahead Next up looks. */
export const NEXT_UP_DAYS = 14;

export function buildNextUp({
  modules,
  entries,
  reminders,
  projectNames,
  describeEntry,
  today,
  limit = 5,
}: {
  modules: GradeModule[];
  entries: Entry[];
  reminders: Reminder[];
  projectNames: Record<string, string>;
  describeEntry: (entry: Entry) => string;
  today: string;
  limit?: number;
}): NextUpItem[] {
  const items: NextUpItem[] = [];

  for (const { module, assessment, days } of upcomingAssessments(modules, today, NEXT_UP_DAYS)) {
    items.push({
      id: `assessment-${assessment.id}`,
      kind: assessment.dateKind === "TEST" ? "TEST" : "DUE",
      title: assessment.name,
      context: module.code,
      day: assessment.date!,
      days,
      href: `/grades/${module.id}`,
    });
  }

  for (const entry of entries) {
    if (entry.status !== "OPEN" || !entry.dueDate || entry.archivedAt) continue;
    const day = entry.dueDate.slice(0, 10);
    const days = daysUntil(day, today);
    if (days < 0 || days > NEXT_UP_DAYS) continue;
    items.push({
      id: `entry-${entry.id}`,
      kind: "ENTRY_DUE",
      title: describeEntry(entry),
      context: projectNames[entry.projectId] ?? null,
      day,
      days,
      href: `/projects/${entry.projectId}`,
    });
  }

  // Only reminders the student set themselves: the generated ones are about
  // entries and assessments that are already listed above.
  for (const reminder of reminders) {
    if (reminder.source !== "MANUAL" || reminder.status !== "PENDING") continue;
    const day = localDateKey(new Date(reminder.remindAt));
    const days = daysUntil(day, today);
    if (days < 0 || days > NEXT_UP_DAYS) continue;
    items.push({ id: `reminder-${reminder.id}`, kind: "REMINDER", title: reminder.title, context: null, day, days, href: "/reminders" });
  }

  return items
    .sort((a, b) => a.days - b.days || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export type RadarTone = "neutral" | "caution";

export interface RadarItem {
  id: string;
  text: string;
  /** The next useful step, as a link label. */
  action: string;
  href: string;
  tone: RadarTone;
}

/** At most this many: enough to be useful, never a wall of warnings. */
export const RADAR_LIMIT = 3;

/**
 * The few things worth knowing right now, most useful first. Deliberately
 * not triggered by a single low mark, a falling average, or anything far
 * away: only overdue work, waiting reminders, targets that need a decision,
 * and missing set-up or marks.
 */
export function buildRadar({
  modules,
  summaries,
  entries,
  dueReminders,
  today,
}: {
  /** The modules for the current academic year. */
  modules: GradeModule[];
  summaries: Map<string, ModuleSummary>;
  entries: Entry[];
  /** Pending reminders whose time has come. */
  dueReminders: number;
  today: string;
}): RadarItem[] {
  const items: RadarItem[] = [];

  const overdue = entries.filter(
    (e) => e.status === "OPEN" && !e.archivedAt && e.dueDate && daysUntil(e.dueDate.slice(0, 10), today) < 0
  ).length;
  if (overdue > 0) {
    items.push({
      id: "overdue",
      text: overdue === 1 ? "One logbook entry is past its due date." : `${overdue} logbook entries are past their due date.`,
      action: "Review open work",
      href: "/open-work",
      tone: "caution",
    });
  }

  if (dueReminders > 0) {
    items.push({
      id: "reminders",
      text: dueReminders === 1 ? "A reminder is waiting for you." : `${dueReminders} reminders are waiting for you.`,
      action: "Open reminders",
      href: "/reminders",
      tone: "neutral",
    });
  }

  const byStatus = (status: string) =>
    modules.filter((m) => summaries.get(m.id)?.target?.status === status);

  for (const module of byStatus("NOT_REACHABLE")) {
    const target = summaries.get(module.id)!.target!;
    items.push({
      id: `unreachable-${module.id}`,
      text: `${module.code}: your ${formatWeight(target.value!)} target is out of reach now. A different target may be more useful.`,
      action: "Review target",
      href: `/grades/${module.id}`,
      tone: "neutral",
    });
  }

  for (const module of byStatus("STRETCH")) {
    const target = summaries.get(module.id)!.target!;
    items.push({
      id: `stretch-${module.id}`,
      text: `${module.code}: you'll need about ${formatRequired(target.required!)} on the remaining work to reach ${formatWeight(target.value!)}.`,
      action: "See what's left",
      href: `/grades/${module.id}`,
      tone: "neutral",
    });
  }

  for (const module of modules) {
    if (summaries.get(module.id)?.setup.valid !== false) continue;
    items.push({
      id: `setup-${module.id}`,
      text: `${module.code}: finish setting up its assessments to see what you need.`,
      action: "Finish set-up",
      href: `/grades/${module.id}`,
      tone: "neutral",
    });
  }

  for (const module of modules) {
    const waiting = module.assessments.find((a) => awaitingMark(a, today));
    if (!waiting) continue;
    items.push({
      id: `awaiting-${waiting.id}`,
      text: `${module.code}: add your mark for ${waiting.name} when you have it.`,
      action: "Add mark",
      href: `/grades/${module.id}`,
      tone: "neutral",
    });
  }

  return items.slice(0, RADAR_LIMIT);
}
