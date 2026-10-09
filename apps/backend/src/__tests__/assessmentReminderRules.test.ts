import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_MILESTONES,
  ASSESSMENT_REMINDER_TIME,
  assessmentMilestone,
  assessmentReminderTitle,
} from "../utils/reminders.js";

// FEAT-009 Phase 4 — the pure parts of the assessment reminder rule. The rule
// itself, against the database, is in assessmentReminders.test.ts.

describe("assessment reminder milestones", () => {
  it("reminds 5 days and 2 days before, from 08:00", () => {
    expect(ASSESSMENT_MILESTONES).toEqual([5, 2]);
    expect(ASSESSMENT_REMINDER_TIME).toBe("08:00");
  });

  it.each([
    [6, null],
    [5, 5],
    [4, 5],
    [3, 5],
    [2, 2],
    [1, 2],
    [0, 2],
    [-1, null],
  ])("an assessment %i days away is covered by the %s-day reminder", (days, milestone) => {
    expect(assessmentMilestone(days)).toBe(milestone);
  });
});

describe("assessment reminder titles", () => {
  const date = new Date("2026-11-15T00:00:00.000Z");

  it("names the date rather than counting down to it", () => {
    expect(assessmentReminderTitle({ name: "Final Test", date, dateKind: "TEST", module: { code: "COMS3011A" } })).toBe(
      "Test on Sun 15 Nov: COMS3011A Final Test"
    );
    expect(
      assessmentReminderTitle({ name: "Assignment 2", date: new Date("2026-11-20T00:00:00.000Z"), dateKind: "DUE", module: { code: "COMS3011A" } })
    ).toBe("Due Fri 20 Nov: COMS3011A Assignment 2");
  });

  it("reads the date as the calendar day it is, whatever the server's zone", () => {
    // A DATE column is midnight UTC; read in a zone west of UTC it would be the 14th.
    expect(assessmentReminderTitle({ name: "X", date, dateKind: "TEST", module: { code: "A" } })).toContain("15 Nov");
  });

  it("fits the reminder title column", () => {
    const title = assessmentReminderTitle({ name: "N".repeat(300), date, dateKind: "DUE", module: { code: "A" } });
    expect(title.length).toBe(255);
    expect(title.endsWith("...")).toBe(true);
  });
});
