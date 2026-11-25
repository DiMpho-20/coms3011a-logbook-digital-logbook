import type { Entry, EntryField } from "../../api";
import { fieldValueText } from "../../lib/utils";

/**
 * The one line that describes an entry in a list.
 *
 * A text field if the project has one; otherwise the first value that has
 * something in it, rendered the way that field type wants to be read.
 */
export function entrySummary(entry: Entry, fields: EntryField[]): string {
  // Try to find a text field value as the "description"
  for (const field of fields) {
    if (field.type === "TEXT") {
      const val = entry.values?.[field.id];
      if (val && typeof val === "string" && val.trim()) return val.trim();
    }
  }
  // Fallback: first non-empty value
  for (const field of fields) {
    const val = entry.values?.[field.id];
    if (val != null && val !== false && val !== "") {
      if (field.type === "BOOLEAN") return val ? "Yes" : "No";
      // Checklists and references are objects; show their labels.
      const text = fieldValueText(val);
      if (text) return text;
    }
  }
  return "—";
}

/** "Today", "Yesterday", a weekday within the week, then the date. */
export function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
