export type GroupResult = { groups: { key: string; value: number }[] };
export type TimelineResult = { points: { date: string; value: number }[] };
export type Bucket = "day" | "week" | "month";

export type SavedStatistic = {
  id: string;
  name: string;
  expression: string;
  value: number | null;
  error: string | null;
};

export const OPERATIONS = ["sum", "avg", "count", "min", "max"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const COUNT_MODE = "__count__";

/**
 * The value sent to the timeline endpoint that plots each entry by its own
 * date (entryDate, falling back to the day it was created) rather than by a
 * DATE field's value. Mirrors the reserved literal the backend accepts, and
 * is what makes a project without any DATE field plottable.
 */
export const ENTRY_DATE_OPTION = "ENTRY_DATE";

export function formatNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

/** The operations, in words. The values sent to the server are unchanged. */
export const OPERATION_LABELS: Record<Operation, string> = {
  sum: "Total",
  avg: "Average",
  count: "Count",
  min: "Lowest",
  max: "Highest",
};

const asDay = (iso: string) => new Date(`${iso}T00:00:00`);
const shortDay = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A bucket's start date, as a reader would name the period: "Sep 3", "Sep 1–7", "Sep 2026". */
export function periodLabel(iso: string, bucket: Bucket): string {
  const start = asDay(iso);
  if (bucket === "day") return shortDay(start);
  if (bucket === "month") return start.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return start.getMonth() === end.getMonth()
    ? `${shortDay(start)}–${end.getDate()}`
    : `${shortDay(start)} – ${shortDay(end)}`;
}

export const selectClass =
  "w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
export const labelClass = "block text-xs font-medium text-slate-600 mb-1";
