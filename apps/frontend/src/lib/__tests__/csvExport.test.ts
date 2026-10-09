import { describe, it, expect } from "vitest";
import { entriesToCsv, type CsvProject } from "../csvExport";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  projectId: "p1",
  durationMinutes: 45,
  entryDate: "2026-10-01T00:00:00.000Z",
  dueDate: null,
  values: {},
  status: "OPEN",
  completedAt: null,
  archivedAt: null,
  tags: [],
  format: null,
  createdAt: "2026-10-02T09:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
  ...over,
});

const rows = (csv: string) => csv.split("\r\n").map((line) => line.slice(1, -1).split('","'));

describe("entriesToCsv", () => {
  it("writes one row per entry with the fixed columns and each field by name", () => {
    const csv = entriesToCsv([
      {
        project: { name: "Thesis" },
        fields: [{ id: "f1", name: "Summary" }, { id: "f2", name: "Steps" }],
        entries: [entry({
          status: "DONE",
          tags: ["exam", "ml"],
          archivedAt: "2026-10-03T00:00:00.000Z",
          dueDate: "2026-10-05T00:00:00.000Z",
          values: { f1: "Wrote intro", f2: [{ label: "outline", checked: true }, { label: "draft", checked: false }] },
        })],
      },
    ] as unknown as CsvProject[]);

    const [header, row] = rows(csv);
    expect(header).toEqual(["Project", "Date", "Duration (minutes)", "Status", "Due date", "Tags", "Archived", "Summary", "Steps"]);
    expect(row).toEqual(["Thesis", "2026-10-01", "45", "Done", "2026-10-05", "exam, ml", "Yes", "Wrote intro", "[x] outline; [ ] draft"]);
  });

  it("shares a column between projects that use the same field name, and names references by label", () => {
    const csv = entriesToCsv([
      { project: { name: "A" }, fields: [{ id: "a1", name: "Summary" }], entries: [entry({ values: { a1: "one" } })] },
      {
        project: { name: "B" },
        fields: [{ id: "b1", name: "Summary" }, { id: "b2", name: "Related" }],
        entries: [entry({ entryDate: null, values: { b1: "two", b2: { id: "x", label: "Thesis", kind: "project" } } })],
      },
    ] as unknown as CsvProject[]);

    const [header, a, b] = rows(csv);
    expect(header.slice(7)).toEqual(["Summary", "Related"]);
    expect(a.slice(7)).toEqual(["one", ""]);
    // No entry date: the day it was written.
    expect(b[1]).toBe("2026-10-02");
    expect(b.slice(7)).toEqual(["two", "Thesis"]);
  });

  it("names a value by the format the entry was written in, so a removed field keeps its column", () => {
    const csv = entriesToCsv([{
      project: { name: "A" },
      fields: [],
      entries: [entry({ values: { old: "kept" }, format: { version: 1, fields: [{ id: "old", name: "Mood" }] } })],
    }] as unknown as CsvProject[]);

    const [header, row] = rows(csv);
    expect(header[7]).toBe("Mood");
    expect(row[7]).toBe("kept");
  });

  it("escapes quotes and stops values being run as spreadsheet formulas", () => {
    const csv = entriesToCsv([{
      project: { name: 'Say "hi"' },
      fields: [{ id: "f1", name: "Note" }],
      entries: [entry({ values: { f1: "=HYPERLINK(\"x\")" } })],
    }] as unknown as CsvProject[]);

    const line = csv.split("\r\n")[1];
    expect(line.startsWith('"Say ""hi"""')).toBe(true);
    expect(line.endsWith('"\'=HYPERLINK(""x"")"')).toBe(true);
  });
});
