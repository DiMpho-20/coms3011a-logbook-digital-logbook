import type { ArchivedFilter } from "../../api";

export type EntryView = "active" | "archived" | "all";

/** Which entries the project page lists, as the endpoint's archive flag. */
export const ARCHIVED_FILTER: Record<EntryView, ArchivedFilter> = {
  active: "exclude",
  archived: "only",
  all: "include",
};

/** "Today", "Yesterday", "3 days ago", then the date. */
export function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Monday · 3 March 2026" — the heading a day's entries sit under. */
export function dateHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: "long" });
  const year = date.getFullYear();
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday} · ${day} ${month} ${year}`;
}
