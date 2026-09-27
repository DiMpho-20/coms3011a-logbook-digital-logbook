import { entryDateKey, localDateKey } from "./utils";

// Dashboard insight panels (US18): streaks, monthly counts, progress over
// time, tag ranking and week-by-week comparison. Every entry is counted on
// the calendar day it falls under (entryDateKey), matching the Activity chart.
// Weeks run Monday to Sunday.

type InsightEntry = {
  entryDate?: string | null;
  createdAt: string;
  durationMinutes?: number | null;
  tags?: string[] | null;
};

/** A local-midnight Date for a YYYY-MM-DD key. */
function dayFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The Monday on or before the given day, at local midnight. */
export function startOfWeek(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** The key (YYYY-MM-DD of its Monday) of the week a day key falls in. */
function weekKeyOf(dayKey: string): string {
  return localDateKey(startOfWeek(dayFromKey(dayKey)));
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Streaks ──────────────────────────────────────────────────────────────

export interface EntryStreaks {
  /** Consecutive days with an entry, ending today (or yesterday, if today has none yet). */
  current: number;
  /** The longest run of consecutive days with an entry, ever. */
  longest: number;
  /** Whether today already has an entry, so the current streak is safe. */
  loggedToday: boolean;
}

export function entryStreaks(entries: InsightEntry[], today = new Date()): EntryStreaks {
  const days = new Set(entries.map(entryDateKey));
  const todayKey = localDateKey(today);
  const loggedToday = days.has(todayKey);

  let current = 0;
  let cursor = loggedToday ? today : addDays(today, -1);
  while (days.has(localDateKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of [...days].sort()) {
    run = previous !== null && localDateKey(addDays(dayFromKey(previous), 1)) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }

  return { current, longest, loggedToday };
}

// ── Entries per month ────────────────────────────────────────────────────

export interface MonthCount {
  /** YYYY-MM */
  key: string;
  label: string;
  count: number;
}

/** Entry counts for the last `months` calendar months, oldest first. */
export function monthlyEntryCounts(entries: InsightEntry[], months = 6, today = new Date()): MonthCount[] {
  const result: MonthCount[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = localDateKey(month).slice(0, 7);
    const label = month.toLocaleDateString(undefined, {
      month: "short",
      ...(month.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    });
    result.push({ key, label, count: 0 });
  }
  const byKey = new Map(result.map((m) => [m.key, m]));
  entries.forEach((e) => {
    const month = byKey.get(entryDateKey(e).slice(0, 7));
    if (month) month.count++;
  });
  return result;
}

// ── Progress over time ───────────────────────────────────────────────────

export interface WeekProgress {
  /** YYYY-MM-DD of the week's Monday. */
  key: string;
  label: string;
  entries: number;
  minutes: number;
  /** Every entry up to the end of this week — the student's running total. */
  total: number;
}

/** The last `weeks` weeks (this one included), oldest first. */
export function weeklyProgress(entries: InsightEntry[], weeks = 8, today = new Date()): WeekProgress[] {
  const thisWeek = startOfWeek(today);
  const result: WeekProgress[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    result.push({ key: localDateKey(start), label: shortDate(start), entries: 0, minutes: 0, total: 0 });
  }
  const byKey = new Map(result.map((w) => [w.key, w]));
  let before = 0;
  entries.forEach((e) => {
    const weekKey = weekKeyOf(entryDateKey(e));
    const week = byKey.get(weekKey);
    if (week) {
      week.entries++;
      week.minutes += e.durationMinutes || 0;
    } else if (weekKey < result[0].key) {
      before++;
    }
  });
  let running = before;
  result.forEach((w) => {
    running += w.entries;
    w.total = running;
  });
  return result;
}

// ── Tag ranking ──────────────────────────────────────────────────────────

export interface TagRank {
  name: string;
  /** Entries carrying this tag. */
  entries: number;
  /** Share of all entries carrying this tag, 0–100. */
  percent: number;
}

/** Tags by how many entries use them, most-used first (ties alphabetical). */
export function tagRanking(entries: InsightEntry[]): TagRank[] {
  const counts = new Map<string, number>();
  entries.forEach((e) => {
    new Set(e.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });
  return [...counts]
    .map(([name, count]) => ({
      name,
      entries: count,
      percent: entries.length ? Math.round((count / entries.length) * 100) : 0,
    }))
    .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
}

// ── Week comparison ──────────────────────────────────────────────────────

export interface WeekOption {
  /** YYYY-MM-DD of the week's Monday. */
  key: string;
  label: string;
}

/** The last `count` weeks, newest first, for choosing weeks to compare. */
export function recentWeeks(count = 12, today = new Date()): WeekOption[] {
  const thisWeek = startOfWeek(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * i);
    const range = `${shortDate(start)} – ${shortDate(addDays(start, 6))}`;
    const label = i === 0 ? `This week (${range})` : i === 1 ? `Last week (${range})` : range;
    return { key: localDateKey(start), label };
  });
}

export interface WeekSummary {
  entries: number;
  minutes: number;
  /** Days of the week with at least one entry, 0–7. */
  activeDays: number;
  /** The tag used on most of the week's entries, or null. */
  topTag: string | null;
}

/** Totals for the week starting on the Monday `weekKey`. */
export function summariseWeek(entries: InsightEntry[], weekKey: string): WeekSummary {
  const inWeek = entries.filter((e) => weekKeyOf(entryDateKey(e)) === weekKey);
  return {
    entries: inWeek.length,
    minutes: inWeek.reduce((sum, e) => sum + (e.durationMinutes || 0), 0),
    activeDays: new Set(inWeek.map(entryDateKey)).size,
    topTag: tagRanking(inWeek)[0]?.name ?? null,
  };
}
