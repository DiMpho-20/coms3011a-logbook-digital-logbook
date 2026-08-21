import type { EntryFieldValue } from "../api";

/** Format minutes into a human-readable duration string (e.g. "2h 30m"). */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** ISO date string for today (YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format a date key into a human-friendly heading (Today / Yesterday / "Wed, Aug 21"). */
export function formatDateHeading(dateKey: string): string {
  const date = new Date(dateKey + "T00:00:00");
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (dateKey === today) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Compute consecutive day streak ending at today or yesterday. */
export function computeStreak(dateKeys: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!dateKeys.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateKeys.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Build default empty values for a set of entry fields. */
export function defaultValuesForFields(
  fields: { id: string; type: string }[]
): Record<string, EntryFieldValue> {
  const values: Record<string, EntryFieldValue> = {};
  fields.forEach((f) => {
    if (f.type === "DATE") values[f.id] = todayISO();
    else if (f.type === "BOOLEAN") values[f.id] = false;
    else values[f.id] = "";
  });
  return values;
}

/** Check if an entry field value is empty. */
export function isEmptyValue(v: EntryFieldValue): boolean {
  return v === "" || v === undefined || v === null;
}

/** Time-aware greeting. */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
