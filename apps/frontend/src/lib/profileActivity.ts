/**
 * Turning a student's entries into the numbers their profile shows.
 *
 * Kept free of React, the API client and the network on purpose: every
 * function here is a plain transformation of data it is handed, so the streak
 * arithmetic and the calendar grid can be tested directly instead of through
 * a rendered page and a mocked request.
 *
 * Dates are handled in the viewer's own timezone throughout. An entry written
 * at 23:00 belongs to that evening, not to the next morning in UTC, and a
 * streak that breaks at midnight UTC would look wrong to everyone who is not
 * in London.
 */

/** The part of an entry this module reads — any real Entry satisfies it. */
export interface ActivityEntry {
  id: string;
  projectId: string;
  durationMinutes: number;
  entryDate: string | null;
  createdAt: string;
  tags: string[];
  status: "OPEN" | "DONE";
  /** The entry's own fields, whatever its project's format defines. */
  values?: Record<string, unknown> | null;
}

export interface ActivitySummary {
  totalEntries: number;
  totalMinutes: number;
  /** Distinct days with at least one entry. */
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  /** Entries per day, keyed "YYYY-MM-DD" in local time. */
  byDay: Map<string, number>;
}

export interface HeatmapCell {
  /** "YYYY-MM-DD", local. */
  date: string;
  count: number;
  /** 0 (nothing) to 4 (busiest band) — the index into the colour ramp. */
  level: 0 | 1 | 2 | 3 | 4;
  /** True for a cell after today, which is rendered as empty space. */
  future: boolean;
}

/** A date's local calendar day as "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The day an entry belongs to.
 *
 * entryDate when the student set one, creation time otherwise — the same
 * COALESCE the listing endpoint orders by, so a backdated entry appears in
 * the week the rest of the interface already shows it in.
 */
export function entryDay(entry: ActivityEntry): string {
  return dayKey(new Date(entry.entryDate ?? entry.createdAt));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Consecutive days ending today.
 *
 * Yesterday still counts as current: a student who has not logged anything
 * yet *today* has not broken their streak, they simply have not got to it.
 * Anything older than that has.
 */
function currentStreakFrom(byDay: Map<string, number>, today: Date): number {
  let cursor = byDay.has(dayKey(today)) ? today : addDays(today, -1);
  if (!byDay.has(dayKey(cursor))) return 0;

  let streak = 0;
  while (byDay.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function longestStreakFrom(byDay: Map<string, number>): number {
  const days = [...byDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of days) {
    // Compare by date arithmetic rather than by string, so month and year
    // boundaries are not special cases.
    const expected = previous ? dayKey(addDays(new Date(`${previous}T00:00:00`), 1)) : null;
    run = expected === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

export function summariseActivity(entries: ActivityEntry[], today: Date = new Date()): ActivitySummary {
  const byDay = new Map<string, number>();
  let totalMinutes = 0;

  for (const entry of entries) {
    const day = entryDay(entry);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    // Duration is optional in practice; a missing or malformed one counts as
    // zero rather than poisoning the total with NaN.
    totalMinutes += Number.isFinite(entry.durationMinutes) ? entry.durationMinutes : 0;
  }

  return {
    totalEntries: entries.length,
    totalMinutes,
    activeDays: byDay.size,
    currentStreak: currentStreakFrom(byDay, today),
    longestStreak: longestStreakFrom(byDay),
    byDay,
  };
}

/**
 * Bands for the colour ramp.
 *
 * Fixed thresholds rather than quantiles of this student's own data: a
 * quantile scale would paint a quiet week the same dark shade as a busy one
 * purely because it was that student's busiest, which makes two profiles
 * incomparable and flatters an empty logbook.
 */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/**
 * The calendar grid, oldest week first, each week running Sunday to Saturday.
 *
 * Ends on the Saturday of the current week so the final column is a whole
 * week with the days after today left blank, rather than a ragged edge that
 * reads as missing data.
 */
export function buildHeatmap(
  byDay: Map<string, number>,
  today: Date = new Date(),
  weeks = 26
): HeatmapCell[][] {
  const endOfWeek = addDays(today, 6 - today.getDay());
  const start = addDays(endOfWeek, -(weeks * 7 - 1));
  const todayKey = dayKey(today);

  const grid: HeatmapCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatmapCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day);
      const key = dayKey(date);
      const count = byDay.get(key) ?? 0;
      column.push({ date: key, count, level: activityLevel(count), future: key > todayKey });
    }
    grid.push(column);
  }
  return grid;
}

export interface TagCount {
  name: string;
  count: number;
}

/** The tags this student reaches for most, busiest first, ties alphabetical. */
export function topTags(entries: ActivityEntry[], limit = 6): TagCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** "4h 30m", "45m", "—" for nothing logged. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * A one-line label for an entry in the recent-activity list.
 *
 * An entry has no title field — its shape is whatever the project's format
 * says — so the first non-empty piece of text the student actually wrote is
 * used, which in practice is the description or summary field sitting at the
 * top of most formats. Anything that is not short free text (a number, a
 * checklist, a reference) is skipped rather than rendered as "[object
 * Object]", and an entry with nothing readable falls back to its project.
 */
export function entryHeadline(
  values: Record<string, unknown> | null | undefined,
  fallback: string,
  maxLength = 80
): string {
  for (const value of Object.values(values ?? {})) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
  }
  return fallback;
}
