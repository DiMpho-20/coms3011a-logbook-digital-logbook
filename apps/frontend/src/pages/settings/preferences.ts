import type { AccentColor, Density, Theme } from "../../lib/appearance";

// The preferences this page owns. They live in localStorage, not on the
// server: they describe this browser, not the account.

export type EntryView = "timeline" | "list";
export type SortOrder = "newest" | "oldest";
export type WeekStart = "monday" | "sunday";
export type TimeFormat = "12h" | "24h";

export interface LogbookPrefs {
  defaultProjectId: string;
  defaultView: EntryView;
  defaultSort: SortOrder;
  weekStartsOn: WeekStart;
  timeFormat: TimeFormat;
}

export const DEFAULTS = {
  theme: "light" as Theme,
  accent: "blue" as AccentColor,
  density: "comfortable" as Density,
  logbook: {
    defaultProjectId: "",
    defaultView: "timeline",
    defaultSort: "newest",
    weekStartsOn: "monday",
    timeFormat: "24h",
  } as LogbookPrefs,
};

/** Read a stored preference, falling back when it is missing or unreadable. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
