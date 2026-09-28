import { describe, expect, it } from "vitest";
import { createEntrySchema } from "../schemas/entry.schema.js";
import { dueDateOffsetDays, nextRecurrenceDate } from "../utils/recurringEntries.js";

describe("recurring entry patterns", () => {
  it("accepts each supported recurrence pattern on entry creation", () => {
    for (const pattern of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
      expect(createEntrySchema.parse({
        durationMinutes: 0,
        values: {},
        recurrence: { pattern },
      }).recurrence?.pattern).toBe(pattern);
    }
  });

  it("advances daily, weekly, and monthly patterns on calendar boundaries", () => {
    const start = new Date("2026-01-31T00:00:00.000Z");
    expect(nextRecurrenceDate(start, "DAILY").toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(nextRecurrenceDate(start, "WEEKLY").toISOString()).toBe("2026-02-07T00:00:00.000Z");
    // February has no 31st; continue on its last calendar day instead.
    expect(nextRecurrenceDate(start, "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("preserves the due-date offset for generated occurrences", () => {
    expect(dueDateOffsetDays(
      new Date("2026-06-10T00:00:00.000Z"),
      new Date("2026-06-13T00:00:00.000Z")
    )).toBe(3);
  });
});
