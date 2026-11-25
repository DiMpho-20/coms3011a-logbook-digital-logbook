import type { ArchivedFilter, Entry, EntryField } from "../../api";

/** One page of the listing. The server caps the count, so this is only ever smaller. */
export const PAGE_SIZE = 20;

export interface FieldFilter {
  fieldId: string;
  op: string;
  value: string;
}

/** The filters as they were when the student last pressed Search. */
export interface AppliedFilters {
  search: string;
  projectId: string;
  tab: "all" | "week" | "overdue";
  sort: "newest" | "oldest";
  tags: string[];
  archived: ArchivedFilter;
  fieldFilters: FieldFilter[];
}

/** The operators a field of each type can be filtered by. */
export const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  TEXT: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "equals" },
  ],
  NUMBER: [
    { value: "equals", label: "=" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
  ],
  BOOLEAN: [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
  ],
  DATE: [
    { value: "on", label: "on" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
  ],
  TAGS: [
    { value: "has_tag", label: "has tag" },
  ],
};

export const selectClass =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export function isEmptyFieldValue(value: unknown) {
  return value == null || value === "" || value === false || (Array.isArray(value) && value.length === 0);
}

export function fieldValueLabel(field: EntryField, value: unknown): string {
  if (field.type === "BOOLEAN") return field.name;
  if (field.type === "TAGS" && Array.isArray(value)) return value.join(", ");
  if (field.type === "REFERENCE" && value && typeof value === "object") {
    const reference = value as { id?: string; label?: string };
    return reference.label || reference.id || "";
  }
  return String(value);
}

/** The line that names an entry: its first text field, else its first filled-in value. */
export function entryTitle(entry: Entry, fields: EntryField[]): { title: string; fieldId: string | null } {
  const descField = fields.find((f) => f.type === "TEXT");
  const description = descField ? (entry.values?.[descField.id] as string) || "" : "";
  if (description) return { title: description, fieldId: descField!.id };
  return { title: "Untitled entry", fieldId: null };
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Group a flat list of entries by their visible date, days in the chosen order. */
export function groupEntriesByDate(entries: Entry[], sort: "newest" | "oldest" = "newest"): [string, Entry[]][] {
  const groups: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    const key = (e.entryDate || e.createdAt).slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return Object.entries(groups).sort((a, b) => (sort === "oldest" ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
}

/** The query the listing endpoint expects for one page of this snapshot. */
export function buildQuery(offset: number, snapshot: AppliedFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    projectStatus: "ACTIVE",
    limit: PAGE_SIZE,
    offset,
    entryTab: snapshot.tab,
    sort: snapshot.sort,
  };
  if (snapshot.projectId !== "all") query.projectId = snapshot.projectId;
  if (snapshot.search.trim()) query.search = snapshot.search.trim();
  if (snapshot.tags.length > 0) query.tags = snapshot.tags.join(",");
  if (snapshot.archived !== "exclude") query.archived = snapshot.archived;
  if (snapshot.fieldFilters.length > 0) query.filters = JSON.stringify(snapshot.fieldFilters);
  return query;
}

/** "Due date before \"2026-03-01\"" — the chip that says what is being filtered out. */
export function describeFieldFilter(f: FieldFilter, fieldsByProject: Record<string, EntryField[]>): string {
  const field = Object.values(fieldsByProject).flat().find((x) => x.id === f.fieldId);
  const fieldName = field?.name || "Field";
  const opLabel = OPERATORS_BY_TYPE[field?.type || "TEXT"]?.find((o) => o.value === f.op)?.label || f.op;
  if (f.op === "is_true" || f.op === "is_false") return `${fieldName} ${opLabel}`;
  return `${fieldName} ${opLabel} "${f.value}"`;
}
