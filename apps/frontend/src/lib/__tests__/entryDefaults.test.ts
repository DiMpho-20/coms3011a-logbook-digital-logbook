import { describe, it, expect, beforeEach } from "vitest";
import { entryDefaults, rememberEntryDefaults } from "../quickCapture";

const fields = [
  { id: "sum", type: "TEXT" },
  { id: "cat", type: "TEXT" },
  { id: "hours", type: "NUMBER" },
  { id: "day", type: "DATE" },
  { id: "url", type: "LINK" },
  { id: "rel", type: "REFERENCE" },
  { id: "steps", type: "CHECKLIST" },
  { id: "double", type: "COMPUTED" },
  { id: "topics", type: "TAGS" },
];

const last = {
  durationMinutes: 45,
  tags: ["thesis"],
  values: {
    sum: "Wrote the intro",
    cat: "Writing",
    hours: 1.5,
    day: "2026-10-01",
    url: "https://example.com/paper",
    rel: { id: "p2", label: "Side project", kind: "project" },
    steps: [{ label: "outline", checked: true }, { label: "draft", checked: false }],
    double: 3,
    topics: ["ml"],
  },
};

beforeEach(() => localStorage.clear());

describe("entry defaults", () => {
  it("starts blank in a project with nothing remembered", () => {
    expect(entryDefaults("p1", fields)).toBeNull();
  });

  it("carries the predictable parts of the last entry", () => {
    rememberEntryDefaults("p1", fields, last);
    const d = entryDefaults("p1", fields)!;

    expect(d.duration).toBe("45");
    expect(d.tags).toEqual(["thesis"]);
    expect(d.values).toEqual({
      cat: "Writing",
      hours: 1.5,
      rel: { id: "p2", label: "Side project", kind: "project" },
      // Same items, none ticked yet.
      steps: [{ label: "outline", checked: false }, { label: "draft", checked: false }],
      topics: ["ml"],
    });
  });

  it("leaves out the description, links, dates and computed values", () => {
    rememberEntryDefaults("p1", fields, last);
    const { values } = entryDefaults("p1", fields)!;
    for (const id of ["sum", "url", "day", "double"]) expect(values).not.toHaveProperty(id);
  });

  it("is kept per project", () => {
    rememberEntryDefaults("p1", fields, last);
    expect(entryDefaults("p2", fields)).toBeNull();
  });

  it("drops a value whose field has since been removed or changed type", () => {
    rememberEntryDefaults("p1", fields, last);
    const changed = fields
      .filter((f) => f.id !== "topics")
      .map((f) => (f.id === "cat" ? { ...f, type: "NUMBER" } : f));
    const { values } = entryDefaults("p1", changed)!;
    expect(values).not.toHaveProperty("topics");
    expect(values).not.toHaveProperty("cat");
    expect(values.hours).toBe(1.5);
  });

  it("does not carry a duration of 0", () => {
    rememberEntryDefaults("p1", fields, { ...last, durationMinutes: 0 });
    expect(entryDefaults("p1", fields)!.duration).toBe("");
  });
});
