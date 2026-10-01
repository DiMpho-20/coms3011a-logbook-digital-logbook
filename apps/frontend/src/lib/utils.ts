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

/**
 * YYYY-MM-DD for a Date, in the viewer's local time — not UTC. Statistics
 * like streaks and weekly counts are inherently about the user's own
 * calendar day; slicing `toISOString()` instead reads UTC's day, which
 * silently shifts entries logged near local midnight onto the wrong day
 * for anyone not in UTC+0.
 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO date string for today (YYYY-MM-DD), in local time. */
export function todayISO(): string {
  return localDateKey(new Date());
}

/**
 * The calendar day an entry falls under, in local time: its own `entryDate`
 * if set (already a plain calendar day, safe to slice regardless of time
 * zone), otherwise the local day it was created on.
 */
export function entryDateKey(entry: { entryDate?: string | null; createdAt: string }): string {
  if (entry.entryDate) return entry.entryDate.slice(0, 10);
  return localDateKey(new Date(entry.createdAt));
}

/** Format a date key into a human-friendly heading (Today / Yesterday / "Wed, Aug 21"). */
export function formatDateHeading(dateKey: string): string {
  const date = new Date(dateKey + "T00:00:00");
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);

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
  if (!dateKeys.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateKeys.has(localDateKey(cursor))) {
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
    else if (f.type === "TAGS" || f.type === "CHECKLIST") values[f.id] = [];
    else if (f.type === "REFERENCE") values[f.id] = null;
    else values[f.id] = "";
  });
  return values;
}

/** Check if an entry field value is empty. */
export function isEmptyValue(v: EntryFieldValue): boolean {
  return v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
}

/** Time-aware greeting. */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** A structured value names its column by label, as on the Entries page (#89). */
function valueLabel(value: unknown): string {
  if (value && typeof value === "object") {
    const { label, id } = value as { label?: unknown; id?: unknown };
    return String(label || id || "");
  }
  return String(value);
}

/** The column an entry falls in when the board is grouped by this value. */
export function columnLabel(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  const label = Array.isArray(raw) ? raw.map(valueLabel).join(", ") : valueLabel(raw);
  return label || "—";
}
