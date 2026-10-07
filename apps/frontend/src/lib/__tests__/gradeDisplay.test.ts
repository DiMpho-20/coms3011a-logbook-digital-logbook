import { describe, it, expect } from "vitest";
import type { GradeAssessment, GradeModule } from "@logbook/shared";
import {
  academicYears,
  assessmentProgress,
  awaitingMark,
  countdownLabel,
  daysUntil,
  defaultAcademicYear,
  formatDay,
  moduleInTerm,
  moduleInYear,
  moduleTypeLabel,
  upcomingAssessments,
} from "../gradeDisplay";

const assessment = (over: Partial<GradeAssessment> = {}): GradeAssessment => ({
  id: "a",
  moduleId: "m",
  name: "Final Test",
  section: null,
  weight: 30,
  markObtained: null,
  markMax: null,
  markPercent: null,
  missed: false,
  date: null,
  dateKind: null,
  remind: true,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const module = (over: Partial<GradeModule> = {}): GradeModule => ({
  id: "m",
  code: "COMS3011A",
  name: "Software Design",
  academicYear: 2026,
  type: "SEMESTER",
  semester: 2,
  semester1Weight: null,
  targetMark: null,
  createdAt: "",
  updatedAt: "",
  assessments: [],
  ...over,
});

describe("calendar days", () => {
  it("counts whole days between calendar days", () => {
    expect(daysUntil("2026-11-15", "2026-11-10")).toBe(5);
    expect(daysUntil("2026-11-15", "2026-11-15")).toBe(0);
    expect(daysUntil("2026-11-14", "2026-11-15")).toBe(-1);
    // Across the end of a month and a daylight-saving change elsewhere.
    expect(daysUntil("2026-11-01", "2026-10-25")).toBe(7);
  });

  it("shows a date on its own calendar day, never the day before", () => {
    expect(formatDay("2026-11-15")).toContain("15");
  });

  it.each([
    [0, "Today"],
    [1, "Tomorrow"],
    [5, "In 5 days"],
    [-1, "Yesterday"],
    [-3, "3 days ago"],
  ])("labels %i days as %s", (days, label) => {
    expect(countdownLabel(days)).toBe(label);
  });
});

describe("modules", () => {
  it("describes the module type, with the student's own split", () => {
    expect(moduleTypeLabel(module())).toBe("Semester 2");
    expect(moduleTypeLabel(module({ type: "FULL_YEAR", semester: null, semester1Weight: 60 }))).toBe(
      "Full year · S1 60% / S2 40%"
    );
    expect(moduleTypeLabel(module({ type: "FULL_YEAR", semester: null, semester1Weight: 66.67 }))).toBe(
      "Full year · S1 66.67% / S2 33.33%"
    );
  });

  it("shows full-year modules under both semesters", () => {
    const fullYear = module({ type: "FULL_YEAR", semester: null, semester1Weight: 50 });
    expect(moduleInTerm(fullYear, 1)).toBe(true);
    expect(moduleInTerm(fullYear, 2)).toBe(true);
    expect(moduleInTerm(module({ semester: 2 }), 1)).toBe(false);
    expect(moduleInTerm(module({ semester: 2 }), 2)).toBe(true);
    expect(moduleInTerm(module({ semester: 2 }), "ALL")).toBe(true);
  });
});

describe("academic years", () => {
  it("offers only the years the student has modules in, oldest first", () => {
    const years = academicYears([
      module({ academicYear: 2027 }),
      module({ academicYear: 2026 }),
      module({ academicYear: 2027 }),
    ]);
    expect(years).toEqual([2026, 2027]);
    expect(academicYears([])).toEqual([]);
  });

  it("defaults to this year when it has modules, else the most recent year, else all", () => {
    expect(defaultAcademicYear([2026, 2027], 2026)).toBe(2026);
    expect(defaultAcademicYear([2024, 2025], 2026)).toBe(2025);
    expect(defaultAcademicYear([2027], 2026)).toBe(2027);
    expect(defaultAcademicYear([], 2026)).toBe("ALL");
  });

  it("filters by one year or all of them", () => {
    expect(moduleInYear(module({ academicYear: 2026 }), 2026)).toBe(true);
    expect(moduleInYear(module({ academicYear: 2026 }), 2027)).toBe(false);
    expect(moduleInYear(module({ academicYear: 2026 }), "ALL")).toBe(true);
  });
});

describe("upcoming assessments", () => {
  const today = "2026-11-10";

  it("lists unmarked, dated assessments in the next 14 days, soonest first", () => {
    const m = module({
      assessments: [
        assessment({ id: "later", date: "2026-11-20", dateKind: "DUE" }),
        assessment({ id: "soon", date: "2026-11-12", dateKind: "TEST" }),
        assessment({ id: "too-far", date: "2026-11-25", dateKind: "TEST" }),
        assessment({ id: "past", date: "2026-11-09", dateKind: "TEST" }),
        assessment({ id: "marked", date: "2026-11-11", dateKind: "TEST", markPercent: 70 }),
        assessment({ id: "missed", date: "2026-11-11", dateKind: "TEST", missed: true }),
        assessment({ id: "undated" }),
      ],
    });
    const items = upcomingAssessments([m], today);
    expect(items.map((i) => [i.assessment.id, i.days])).toEqual([
      ["soon", 2],
      ["later", 10],
    ]);
  });

  it("includes today and exactly 14 days out", () => {
    const m = module({
      assessments: [
        assessment({ id: "today", date: "2026-11-10", dateKind: "TEST" }),
        assessment({ id: "edge", date: "2026-11-24", dateKind: "TEST" }),
      ],
    });
    expect(upcomingAssessments([m], today).map((i) => i.assessment.id)).toEqual(["today", "edge"]);
  });

  it("flags a passed date with no mark as awaiting a mark", () => {
    expect(awaitingMark(assessment({ date: "2026-11-09", dateKind: "TEST" }), today)).toBe(true);
    expect(awaitingMark(assessment({ date: "2026-11-10", dateKind: "TEST" }), today)).toBe(false);
    expect(awaitingMark(assessment({ date: "2026-11-09", dateKind: "TEST", markPercent: 50 }), today)).toBe(false);
    expect(awaitingMark(assessment({ date: "2026-11-09", dateKind: "TEST", missed: true }), today)).toBe(false);
  });
});

describe("assessmentProgress", () => {
  it("says how many are marked and how many remain", () => {
    expect(assessmentProgress({ total: 5, marked: 3, missed: 0, remaining: 2 })).toBe("3 of 5 assessments marked · 2 remaining");
  });
  it("mentions missed ones, which count as marked", () => {
    expect(assessmentProgress({ total: 3, marked: 2, missed: 1, remaining: 1 })).toBe("2 of 3 assessments marked (1 missed) · 1 remaining");
  });
  it("says so when everything is marked, or nothing exists yet", () => {
    expect(assessmentProgress({ total: 1, marked: 1, missed: 0, remaining: 0 })).toBe("All 1 assessment marked");
    expect(assessmentProgress({ total: 0, marked: 0, missed: 0, remaining: 0 })).toBe("No assessments yet");
  });
});
