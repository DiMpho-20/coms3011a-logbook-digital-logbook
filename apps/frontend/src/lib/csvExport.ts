import type { Entry, EntryField, Project } from "@logbook/shared";
import { fieldValueText } from "./utils";

/** One project and every entry in it, archived ones included. */
export interface CsvProject {
  project: Pick<Project, "name">;
  fields: Pick<EntryField, "id" | "name">[];
  entries: Entry[];
}

const FIXED_COLUMNS = ["Project", "Date", "Duration (minutes)", "Status", "Due date", "Tags", "Archived"];

/** A checklist keeps whether each item was done; anything else reads as on screen. */
function valueText(value: unknown): string {
  if (Array.isArray(value) && value.some((v) => v && typeof v === "object" && "checked" in v)) {
    return (value as { label: string; checked: boolean }[])
      .map((item) => `[${item.checked ? "x" : " "}] ${item.label}`)
      .join("; ");
  }
  return fieldValueText(value);
}

/**
 * Quote every cell, and stop a value such as "=HYPERLINK(...)" being run as
 * a formula when the file is opened in a spreadsheet.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/**
 * Every entry as a row, readable without the app: one column per field name
 * across all projects (a field each project calls "Summary" shares one
 * column), in the order the fields are first met. An entry is read with the
 * format it was written in, so a field since removed keeps its name.
 */
export function entriesToCsv(projects: CsvProject[]): string {
  const fieldColumns: string[] = [];
  const rows: Record<string, string>[] = [];

  for (const { project, fields, entries } of projects) {
    for (const entry of entries) {
      const names = new Map<string, string>();
      for (const f of entry.format?.fields?.length ? entry.format.fields : fields) names.set(f.id, f.name);

      const row: Record<string, string> = {
        Project: project.name,
        Date: day(entry.entryDate ?? entry.createdAt),
        "Duration (minutes)": String(entry.durationMinutes),
        Status: entry.status === "DONE" ? "Done" : "Open",
        "Due date": day(entry.dueDate),
        Tags: (entry.tags ?? []).join(", "),
        Archived: entry.archivedAt ? "Yes" : "No",
      };
      for (const [fieldId, value] of Object.entries(entry.values ?? {})) {
        const name = names.get(fieldId);
        if (!name) continue;
        if (!fieldColumns.includes(name)) fieldColumns.push(name);
        row[name] = valueText(value);
      }
      rows.push(row);
    }
  }

  const header = [...FIXED_COLUMNS, ...fieldColumns.filter((n) => !FIXED_COLUMNS.includes(n))];
  return [header, ...rows.map((row) => header.map((col) => row[col] ?? ""))]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");
}
