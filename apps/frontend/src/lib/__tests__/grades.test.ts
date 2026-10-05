import { describe, it, expect } from "vitest";
import type { AssessmentSection } from "@logbook/shared";

import {
  REQUIRED_MARK_ASSUMPTION,
  assessmentStatus,
  computeModule,
  formatMark,
  formatPercent,
  formatPoints,
  formatRequired,
  formatSecured,
  formatWeight,
  markProblem,
  markToPercent,
  roundToTenth,
  roundUpToTenth,
  type GradeAssessmentInput,
  type GradeModuleInput,
} from "../grades";

// ── Builders ─────────────────────────────────────────────────────────────

const blank = { markObtained: null, markMax: null, markPercent: null, missed: false };

function assessment(
  name: string,
  weight: number,
  mark: Partial<GradeAssessmentInput> = {},
  section: AssessmentSection | null = null
): GradeAssessmentInput {
  return { id: name, name, section, weight, ...blank, ...mark };
}

const outOf = (name: string, weight: number, obtained: number, max: number, section: AssessmentSection | null = null) =>
  assessment(name, weight, { markObtained: obtained, markMax: max }, section);
const percent = (name: string, weight: number, value: number, section: AssessmentSection | null = null) =>
  assessment(name, weight, { markPercent: value }, section);
const missed = (name: string, weight: number, section: AssessmentSection | null = null) =>
  assessment(name, weight, { missed: true }, section);
const pending = (name: string, weight: number, section: AssessmentSection | null = null) =>
  assessment(name, weight, {}, section);

const semester = (...assessments: GradeAssessmentInput[]): GradeModuleInput => ({
  type: "SEMESTER",
  semester1Weight: null,
  assessments,
});
const fullYear = (semester1Weight: number | null, ...assessments: GradeAssessmentInput[]): GradeModuleInput => ({
  type: "FULL_YEAR",
  semester1Weight,
  assessments,
});

/** The worked example from the feature brief: 45 secured, 60% marked, the 40% exam to come. */
const comsExample = () =>
  semester(
    outOf("Midterm", 40, 25, 40),
    outOf("Tutorial Test 1", 10, 10, 10),
    percent("Tutorial Test 2", 10, 100),
    pending("Exam", 40)
  );

// ── Marks ────────────────────────────────────────────────────────────────

describe("mark entry", () => {
  it("converts obtained / max to a percentage", () => {
    expect(markToPercent(outOf("x", 10, 25, 40))).toBe(62.5);
  });

  it("keeps a percentage entered directly", () => {
    expect(markToPercent(percent("x", 10, 62.5))).toBe(62.5);
  });

  it("counts a missed assessment as 0%", () => {
    expect(markToPercent(missed("x", 10))).toBe(0);
  });

  it("has no percentage before it is marked", () => {
    expect(markToPercent(pending("x", 10))).toBeNull();
  });

  it("keeps a missed assessment distinct from an entered 0%", () => {
    const zero = outOf("x", 10, 0, 40);
    expect(markToPercent(zero)).toBe(0);
    expect(assessmentStatus(zero)).toBe("GRADED");
    expect(assessmentStatus(missed("x", 10))).toBe("MISSED");
    expect(formatMark(zero)).toBe("0 / 40 = 0.0%");
    expect(formatMark(missed("x", 10))).toBe("Missed");
  });

  it("derives the status from the mark", () => {
    expect(assessmentStatus(pending("x", 10))).toBe("PENDING");
    expect(assessmentStatus(percent("x", 10, 50))).toBe("GRADED");
    expect(assessmentStatus(outOf("x", 10, 5, 0))).toBe("PENDING"); // unusable mark
  });

  it.each([
    ["a maximum of 0", { markObtained: 0, markMax: 0 }, "needs a maximum mark above 0"],
    ["obtained above the maximum", { markObtained: 41, markMax: 40 }, "has a mark above the maximum"],
    ["a negative mark", { markObtained: -1, markMax: 40 }, "cannot have a negative mark"],
    ["only the mark obtained", { markObtained: 25 }, "needs both the mark obtained and the maximum mark"],
    ["only the maximum", { markMax: 40 }, "needs both the mark obtained and the maximum mark"],
    ["a percentage above 100", { markPercent: 100.5 }, "needs a percentage between 0 and 100"],
    ["a negative percentage", { markPercent: -1 }, "needs a percentage between 0 and 100"],
    ["a non-number percentage", { markPercent: Number.NaN }, "needs a percentage between 0 and 100"],
    ["both forms at once", { markObtained: 25, markMax: 40, markPercent: 62.5 }, "has both a mark and a percentage; use one"],
    ["missed with a mark", { missed: true, markPercent: 50 }, "is marked as missed but also has a mark"],
  ])("rejects %s", (_case, mark, problem) => {
    const input = assessment("x", 10, mark);
    expect(markProblem(input)).toBe(problem);
    expect(markToPercent(input)).toBeNull();
  });

  it("accepts the edges of the valid range", () => {
    expect(markProblem(outOf("x", 10, 40, 40))).toBeNull();
    expect(markProblem(percent("x", 10, 0))).toBeNull();
    expect(markProblem(percent("x", 10, 100))).toBeNull();
    expect(markProblem(missed("x", 10))).toBeNull();
    expect(markProblem(pending("x", 10))).toBeNull();
  });
});

// ── Display ──────────────────────────────────────────────────────────────

describe("display helpers", () => {
  it("shows the conversion alongside what was entered", () => {
    expect(formatMark(outOf("x", 10, 25, 40))).toBe("25 / 40 = 62.5%");
    expect(formatMark(outOf("x", 10, 12.5, 20))).toBe("12.5 / 20 = 62.5%");
    expect(formatMark(percent("x", 10, 62.5))).toBe("62.5%");
    expect(formatMark(pending("x", 10))).toBe("—");
  });

  it("shows contributions in points, never as a percentage", () => {
    expect(formatPoints(25)).toBe("25.0 pts");
    expect(formatSecured(45)).toBe("45.0 / 100");
  });

  it("rounds to one decimal place, absorbing float noise", () => {
    expect(roundToTenth(1.45)).toBe(1.5);
    expect(roundToTenth(62.5)).toBe(62.5);
    expect(roundToTenth(0.1 + 0.2)).toBe(0.3);
    expect(formatPercent(66.66666)).toBe("66.7%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("rounds the required mark up, so it is never an underestimate", () => {
    expect(formatRequired(12.41)).toBe("12.5%");
    expect(formatRequired(12.5)).toBe("12.5%");
    expect(formatRequired(16.666)).toBe("16.7%");
    // (75 - 45.6) / 40 * 100 is 73.50000000000001 in floating point.
    expect(roundUpToTenth(((75 - 45.6) / 40) * 100)).toBe(73.5);
  });

  it("shows weights as entered", () => {
    expect(formatWeight(40)).toBe("40%");
    expect(formatWeight(33.33)).toBe("33.33%");
    expect(formatWeight(12.5)).toBe("12.5%");
  });

  it("states the assumption behind a required mark", () => {
    expect(REQUIRED_MARK_ASSUMPTION).toMatch(/same mark on every remaining assessment/);
  });
});

// ── The worked examples from the brief ───────────────────────────────────

describe("semester module — worked example", () => {
  const summary = computeModule(comsExample(), { target: 50 });

  it("secures 45 points with 60% marked and 40% remaining", () => {
    expect(summary.setup).toEqual({ valid: true, issues: [] });
    expect(summary.securedPoints).toBeCloseTo(45, 10);
    expect(summary.markedWeight).toBeCloseTo(60, 10);
    expect(summary.remainingWeight).toBeCloseTo(40, 10);
    expect(summary.averageSoFar).toBeCloseTo(75, 10);
    expect(summary.highestPossible).toBeCloseTo(85, 10);
    expect(summary.complete).toBe(false);
  });

  it("gives each assessment's contribution in points", () => {
    const byName = Object.fromEntries(summary.rows.map((row) => [row.name, row]));
    expect(byName["Midterm"].percent).toBe(62.5);
    expect(byName["Midterm"].contribution).toBeCloseTo(25, 10);
    expect(byName["Tutorial Test 1"].contribution).toBeCloseTo(10, 10);
    expect(byName["Tutorial Test 2"].contribution).toBeCloseTo(10, 10);
    expect(byName["Exam"]).toMatchObject({ source: "pending", contribution: null, percent: null, status: "PENDING" });
  });

  it("needs 12.5% on the exam to finish with 50%", () => {
    expect(summary.target).toMatchObject({ value: 50, status: "WITHIN_REACH" });
    expect(summary.target!.pointsNeeded).toBeCloseTo(5, 10);
    expect(summary.target!.required).toBeCloseTo(12.5, 10);
  });

  it.each([
    [40, 61],
    [50, 65],
    [60, 69],
    [70, 73],
    [80, 77],
  ])("projects %i%% on the exam to a final mark of %i%%", (exam, final) => {
    const whatIf = computeModule(comsExample(), { hypothetical: { all: exam } });
    expect(whatIf.projection!.finalMark).toBeCloseTo(final, 10);
  });
});

describe("full-year module — worked example", () => {
  const module = (semester1Weight: number) =>
    fullYear(semester1Weight, percent("Test", 40, 70, 1), percent("Assignment", 60, 80, 1));

  it("works out a 76% Semester 1 mark worth 45.6 points at 60/40", () => {
    const summary = computeModule(module(60));
    expect(summary.setup.valid).toBe(true);
    const [s1, s2] = summary.sections;
    expect(s1.sectionMark).toBeCloseTo(76, 10);
    expect(s1.securedPoints).toBeCloseTo(45.6, 10);
    expect(s1.moduleWeight).toBe(60);
    expect(s2.moduleWeight).toBe(40);
    expect(summary.securedPoints).toBeCloseTo(45.6, 10);
    expect(summary.averageSoFar).toBeCloseTo(76, 10);
  });

  it("uses the student's own split rather than assuming 50/50", () => {
    expect(computeModule(module(70)).securedPoints).toBeCloseTo(53.2, 10);
    expect(computeModule(module(50)).securedPoints).toBeCloseTo(38, 10);
    expect(computeModule(module(70)).sections[1].moduleWeight).toBe(30);
  });

  it("keeps the two weighting levels apart: 40% of a 60% semester is 24% of the module", () => {
    const test = computeModule(module(60)).rows.find((row) => row.name === "Test")!;
    expect(test.weight).toBe(40);
    expect(test.effectiveWeight).toBeCloseTo(24, 10);
    expect(test.contribution).toBeCloseTo(16.8, 10);
  });
});

// ── Weights and setup ────────────────────────────────────────────────────

describe("weights and setup", () => {
  it("allows an incomplete setup but disables target and what-if", () => {
    const summary = computeModule(
      semester(percent("Midterm", 40, 50), pending("Tutorials", 20), pending("Final", 30)),
      { target: 50, hypothetical: { all: 60 } }
    );
    expect(summary.setup.valid).toBe(false);
    expect(summary.setup.issues).toEqual(["Weights total 90% — 10% unassigned."]);
    expect(summary.sections[0]).toMatchObject({ weightTotal: 90, unassignedWeight: 10, weightsComplete: false });
    expect(summary.target).toBeNull();
    expect(summary.projection).toBeNull();
    expect(summary.rows.every((row) => row.source !== "hypothetical")).toBe(true);
    // The figures that don't depend on a complete setup are still there.
    expect(summary.securedPoints).toBeCloseTo(20, 10);
  });

  it("reports over-allocated weights", () => {
    const summary = computeModule(semester(pending("A", 60), pending("B", 50)));
    expect(summary.setup.issues).toEqual(["Weights total 110% — 10% too much."]);
  });

  it("never normalises weights", () => {
    const summary = computeModule(semester(percent("A", 40, 100), pending("B", 50)));
    expect(summary.securedPoints).toBeCloseTo(40, 10);
    expect(summary.remainingWeight).toBeCloseTo(50, 10);
  });

  it("treats 33.33 × 3 as complete", () => {
    const summary = computeModule(semester(pending("A", 33.33), pending("B", 33.33), pending("C", 33.33)), { target: 50 });
    expect(summary.setup.valid).toBe(true);
    expect(summary.target).not.toBeNull();
  });

  it("treats 99.98 as incomplete: the tolerance is 0.01, not a rounding licence", () => {
    const summary = computeModule(semester(pending("A", 33.33), pending("B", 33.33), pending("C", 33.32)));
    expect(summary.setup.issues).toEqual(["Weights total 99.98% — 0.02% unassigned."]);
  });

  it.each([-5, 101, Number.NaN])("rejects a weight of %s", (weight) => {
    const summary = computeModule(semester(pending("Odd", weight), pending("B", 100)));
    expect(summary.setup.issues).toContain('"Odd" needs a weight between 0 and 100.');
    expect(summary.rows[0].weight).toBe(0);
  });

  it("allows a weight of 0, which counts for nothing", () => {
    const summary = computeModule(semester(percent("Practice", 0, 100), percent("Exam", 100, 50)));
    expect(summary.setup.valid).toBe(true);
    expect(summary.securedPoints).toBeCloseTo(50, 10);
    expect(summary.averageSoFar).toBeCloseTo(50, 10);
  });

  it("reports an unusable mark and treats the assessment as not yet marked", () => {
    const summary = computeModule(semester(outOf("Quiz", 50, 45, 40), pending("Exam", 50)), { target: 50 });
    expect(summary.setup.issues).toEqual(['"Quiz" has a mark above the maximum.']);
    expect(summary.rows[0]).toMatchObject({ source: "pending", problem: "has a mark above the maximum" });
    expect(summary.remainingWeight).toBeCloseTo(100, 10);
    expect(summary.target).toBeNull();
  });

  it("names an untitled assessment in its issue", () => {
    const summary = computeModule(semester(percent(" ", 100, 200)));
    expect(summary.setup.issues).toEqual(['"Untitled assessment" needs a percentage between 0 and 100.']);
  });

  it("rejects a target outside 0–100", () => {
    const summary = computeModule(comsExample(), { target: 120 });
    expect(summary.setup.issues).toEqual(["The target needs to be between 0 and 100."]);
    expect(summary.target).toBeNull();
  });

  it("rejects an assessment placed in a semester of a semester module", () => {
    const summary = computeModule(semester(pending("Exam", 100, 1)));
    expect(summary.setup.issues).toEqual(['"Exam" is in a semester, but this is a semester module.']);
  });
});

describe("full-year setup", () => {
  it.each([null, -1, 100.5, Number.NaN])("needs a Semester 1 weighting (given %s), with no 50/50 fallback", (weight) => {
    const summary = computeModule(fullYear(weight, percent("Test", 100, 80, 1)), { target: 50 });
    expect(summary.setup.issues).toEqual([
      "Set how much Semester 1 counts towards the final mark (Semester 2 gets the rest).",
    ]);
    expect(summary.sections.map((s) => s.moduleWeight)).toEqual([0, 0]);
    expect(summary.securedPoints).toBe(0);
    expect(summary.sections[0].sectionMark).toBeCloseTo(80, 10); // still useful on its own
    expect(summary.target).toBeNull();
  });

  it("allows a 0/100 or 100/0 split", () => {
    expect(computeModule(fullYear(0, percent("T", 100, 80, 2))).securedPoints).toBeCloseTo(80, 10);
    expect(computeModule(fullYear(100, percent("T", 100, 80, 1))).securedPoints).toBeCloseTo(80, 10);
  });

  it("needs every assessment in a semester", () => {
    const summary = computeModule(fullYear(60, pending("Lost", 100)));
    expect(summary.setup.issues).toEqual(['"Lost" needs a semester (1 or 2).']);
    expect(summary.rows[0].effectiveWeight).toBe(0);
  });

  it("treats a semester with no assessments yet as still to come in full", () => {
    const summary = computeModule(fullYear(60, percent("Test", 40, 70, 1), percent("Assignment", 60, 80, 1)), {
      target: 75,
    });
    expect(summary.setup.valid).toBe(true);
    expect(summary.sections[1]).toMatchObject({ assessmentCount: 0, weightsComplete: true, sectionMark: null });
    expect(summary.sections[1].remainingWeight).toBeCloseTo(40, 10);
    expect(summary.remainingWeight).toBeCloseTo(40, 10);
    // (75 - 45.6) / 40 = 73.5% on all of Semester 2.
    expect(summary.target!.required).toBeCloseTo(73.5, 10);
    expect(summary.target!.status).toBe("WITHIN_REACH");
  });

  it("disables targets when a semester that has assessments doesn't total 100", () => {
    const summary = computeModule(
      fullYear(60, percent("Test", 40, 70, 1), percent("Assignment", 60, 80, 1), pending("S2 Test", 50, 2)),
      { target: 75 }
    );
    expect(summary.setup.issues).toEqual(["Semester 2 weights total 50% — 50% unassigned."]);
    expect(summary.target).toBeNull();
  });

  it("combines two partly marked semesters", () => {
    const summary = computeModule(
      fullYear(
        60,
        percent("S1 Test", 40, 70, 1),
        pending("S1 Exam", 60, 1),
        percent("S2 Assignment", 50, 90, 2),
        pending("S2 Exam", 50, 2)
      ),
      { target: 75 }
    );
    // Effective weights: 24, 36, 20, 20.
    expect(summary.securedPoints).toBeCloseTo(16.8 + 18, 10);
    expect(summary.markedWeight).toBeCloseTo(44, 10);
    expect(summary.remainingWeight).toBeCloseTo(56, 10);
    expect(summary.sections[0].sectionMark).toBeCloseTo(70, 10);
    expect(summary.sections[1].sectionMark).toBeCloseTo(90, 10);
    expect(summary.averageSoFar).toBeCloseTo((34.8 / 44) * 100, 10);
    expect(summary.target!.required).toBeCloseTo((40.2 / 56) * 100, 10);
    expect(formatRequired(summary.target!.required!)).toBe("71.8%");
  });
});

// ── Progress through a module ────────────────────────────────────────────

describe("progress", () => {
  it("with nothing marked: 0 secured, no average, required = target", () => {
    const summary = computeModule(semester(pending("Test", 40), pending("Exam", 60)), { target: 60 });
    expect(summary.securedPoints).toBe(0);
    expect(summary.averageSoFar).toBeNull();
    expect(summary.target).toMatchObject({ status: "NOT_ENOUGH_DATA" });
    expect(summary.target!.required).toBeCloseTo(60, 10);
  });

  it("with no assessments at all: everything still to come", () => {
    const summary = computeModule(semester(), { target: 50 });
    expect(summary.setup.valid).toBe(true);
    expect(summary.remainingWeight).toBe(100);
    expect(summary.target).toMatchObject({ status: "NOT_ENOUGH_DATA", required: 50 });
  });

  it("with one assessment marked", () => {
    const summary = computeModule(semester(percent("Test", 30, 80), pending("Exam", 70)), { target: 60 });
    expect(summary.securedPoints).toBeCloseTo(24, 10);
    expect(summary.averageSoFar).toBeCloseTo(80, 10);
    expect(summary.target!.required).toBeCloseTo((36 / 70) * 100, 10);
    expect(summary.target!.status).toBe("WITHIN_REACH");
  });

  it("with everything marked: the secured points are the final mark", () => {
    const module = semester(percent("Test", 30, 80), percent("Exam", 70, 50));
    const summary = computeModule(module, { target: 60, hypothetical: { all: 100 } });
    expect(summary.complete).toBe(true);
    expect(summary.securedPoints).toBeCloseTo(59, 10);
    expect(summary.remainingWeight).toBe(0);
    expect(summary.target).toMatchObject({ status: "NOT_REACHABLE", required: null });
    expect(summary.projection!.finalMark).toBeCloseTo(59, 10);
    expect(computeModule(module, { target: 55 }).target!.status).toBe("SECURED");
  });

  it("counts a missed assessment as marked, at 0", () => {
    const summary = computeModule(semester(missed("Test", 20), percent("Assignment", 20, 100), pending("Exam", 60)));
    expect(summary.rows[0]).toMatchObject({ source: "missed", status: "MISSED", percent: 0, contribution: 0 });
    expect(summary.markedWeight).toBeCloseTo(40, 10);
    expect(summary.averageSoFar).toBeCloseTo(50, 10);
  });

  it("follows a changed or removed mark, since nothing is stored", () => {
    const before = computeModule(comsExample(), { target: 50 });
    const changed = comsExample();
    changed.assessments[0] = outOf("Midterm", 40, 10, 40);
    const after = computeModule(changed, { target: 50 });
    expect(after.securedPoints).toBeCloseTo(30, 10);
    expect(after.target!.required).toBeGreaterThan(before.target!.required!);

    const removed = comsExample();
    removed.assessments.splice(1, 1);
    expect(computeModule(removed).setup.issues).toEqual(["Weights total 90% — 10% unassigned."]);
  });
});

// ── Targets ──────────────────────────────────────────────────────────────

describe("target status", () => {
  const status = (target: number | null) => computeModule(comsExample(), { target }).target!;

  it("has no status without a target", () => {
    expect(status(null)).toEqual({ value: null, status: "NO_TARGET", pointsNeeded: null, required: null });
    expect(computeModule(comsExample()).target!.status).toBe("NO_TARGET");
  });

  it("is SECURED once the target can't be missed, even with 0 on the rest", () => {
    expect(status(40)).toMatchObject({ status: "SECURED", pointsNeeded: 0, required: null });
  });

  it("is SECURED when exactly secured (required would be 0)", () => {
    expect(status(45)).toMatchObject({ status: "SECURED", required: null });
  });

  it("is WITHIN_REACH when the required mark is at or below the average so far", () => {
    expect(status(70).status).toBe("WITHIN_REACH"); // needs 62.5, averaging 75
    expect(status(75).status).toBe("WITHIN_REACH"); // needs exactly 75
  });

  it("is STRETCH when it needs more than the average so far", () => {
    expect(status(80)).toMatchObject({ status: "STRETCH" });
    expect(status(80).required).toBeCloseTo(87.5, 10);
  });

  it("is STRETCH when only full marks will do", () => {
    expect(status(85).status).toBe("STRETCH");
    expect(status(85).required).toBeCloseTo(100, 10);
  });

  it("is NOT_REACHABLE above the highest possible mark, without a >100 requirement", () => {
    expect(status(90)).toMatchObject({ status: "NOT_REACHABLE", required: null });
    expect(status(90).pointsNeeded).toBeCloseTo(45, 10);
  });

  it("holds against float noise at the boundaries", () => {
    // 0.1 + 0.2 style sums must not tip an exact target over the edge.
    const summary = computeModule(
      semester(percent("A", 10, 10), percent("B", 20, 10), percent("C", 30, 10), pending("D", 40)),
      { target: 6 }
    );
    expect(summary.target!.status).toBe("SECURED");
  });
});

// ── What if? ─────────────────────────────────────────────────────────────

describe("what-if", () => {
  const twoLeft = () => semester(percent("Midterm", 40, 62.5), pending("Project", 20), pending("Exam", 40));

  it("leaves the real figures untouched", () => {
    const real = computeModule(twoLeft(), { target: 60 });
    const whatIf = computeModule(twoLeft(), { target: 60, hypothetical: { all: 90 } });
    expect(whatIf.securedPoints).toBe(real.securedPoints);
    expect(whatIf.averageSoFar).toBe(real.averageSoFar);
    expect(whatIf.remainingWeight).toBe(real.remainingWeight);
    expect(whatIf.target).toEqual(real.target);
    expect(real.projection).toBeNull();
  });

  it("marks hypothetical rows as such", () => {
    const whatIf = computeModule(twoLeft(), { hypothetical: { all: 50 } });
    expect(whatIf.rows.map((row) => row.source)).toEqual(["actual", "hypothetical", "hypothetical"]);
    expect(whatIf.rows[1].status).toBe("PENDING");
  });

  it("sets assessments individually, with `all` covering the rest", () => {
    const whatIf = computeModule(twoLeft(), { hypothetical: { all: 50, byId: { Project: 100 } } });
    expect(whatIf.projection!.finalMark).toBeCloseTo(25 + 20 + 20, 10);
  });

  it("can't project while some remaining weight has no what-if mark", () => {
    const whatIf = computeModule(twoLeft(), { hypothetical: { byId: { Project: 100 } } });
    expect(whatIf.projection).toEqual({ finalMark: null, unfilledWeight: 40 });
  });

  it("never overrides a real or missed mark", () => {
    const module = semester(percent("Midterm", 40, 62.5), missed("Quiz", 10), pending("Exam", 50));
    const whatIf = computeModule(module, { hypothetical: { all: 100, byId: { Midterm: 100, Quiz: 100 } } });
    expect(whatIf.rows.map((row) => row.source)).toEqual(["actual", "missed", "hypothetical"]);
    expect(whatIf.projection!.finalMark).toBeCloseTo(25 + 0 + 50, 10);
  });

  it("fills a semester with no assessments yet from `all`", () => {
    const module = fullYear(60, percent("Test", 40, 70, 1), percent("Assignment", 60, 80, 1));
    expect(computeModule(module, { hypothetical: { all: 50 } }).projection!.finalMark).toBeCloseTo(45.6 + 20, 10);
    expect(computeModule(module, { hypothetical: { byId: {} } }).projection).toEqual({
      finalMark: null,
      unfilledWeight: 40,
    });
  });

  it("keeps what-if marks within 0–100 and ignores non-numbers", () => {
    const high = computeModule(twoLeft(), { hypothetical: { all: 150 } });
    expect(high.projection!.finalMark).toBeCloseTo(85, 10);
    const junk = computeModule(twoLeft(), { hypothetical: { all: Number.NaN } });
    expect(junk.projection!.finalMark).toBeNull();
  });
});

// ── Explanation ──────────────────────────────────────────────────────────

describe("explanation", () => {
  it("writes out the working with the student's own numbers", () => {
    const lines = computeModule(comsExample(), { target: 50 }).explanation;
    expect(lines).toContainEqual({
      label: "Midterm",
      working: "25 / 40 = 62.5% × 40% of the module",
      result: "25.0 pts",
    });
    expect(lines).toContainEqual({
      label: "Secured",
      working: "25.0 pts + 10.0 pts + 10.0 pts",
      result: "45.0 / 100",
    });
    expect(lines).toContainEqual({
      label: "Average on marked work",
      working: "45.0 pts ÷ 60% marked",
      result: "75.0%",
    });
    expect(lines).toContainEqual({
      label: "Highest possible final mark",
      working: "45.0 pts + full marks on the 40% remaining",
      result: "85.0%",
    });
    expect(lines).toContainEqual({ label: "Still needed for 50%", working: "50% target − 45.0 pts secured", result: "5.0 pts" });
    expect(lines).toContainEqual({
      label: "Required on remaining work",
      working: "5.0 pts ÷ 40% remaining",
      result: "12.5%",
    });
  });

  it("shows both weighting levels for a full-year module", () => {
    const lines = computeModule(fullYear(60, percent("Test", 40, 70, 1), percent("Assignment", 60, 80, 1))).explanation;
    expect(lines).toContainEqual({
      label: "Test",
      working: "70.0% × 24% of the module (40% of Semester 1, which counts 60%)",
      result: "16.8 pts",
    });
    expect(lines).toContainEqual({
      label: "Semester 1",
      working: "76.0% average on the 100% of Semester 1 marked",
      result: "45.6 pts secured",
    });
  });

  it("labels missed and hypothetical marks", () => {
    const lines = computeModule(semester(missed("Quiz", 50), pending("Exam", 50)), { hypothetical: { all: 60 } }).explanation;
    expect(lines[0]).toMatchObject({ label: "Quiz", working: "Missed (0%) × 50% of the module", result: "0.0 pts" });
    expect(lines[1]).toMatchObject({ label: "Exam", working: "60.0% (what-if) × 50% of the module" });
    expect(lines).toContainEqual({
      label: "Projected final mark (hypothetical)",
      working: "0.0 pts secured + 30.0 pts what-if",
      result: "30.0%",
    });
    // Secured counts only real marks.
    expect(lines.find((line) => line.label === "Secured")!.working).toBe("0.0 pts");
  });

  it("says so when nothing is marked, and omits the average", () => {
    const lines = computeModule(semester(pending("Exam", 100))).explanation;
    expect(lines.find((line) => line.label === "Secured")!.working).toBe("Nothing marked yet");
    expect(lines.some((line) => line.label === "Average on marked work")).toBe(false);
  });

  it("drops the highest-possible line once everything is marked", () => {
    const lines = computeModule(semester(percent("Exam", 100, 70))).explanation;
    expect(lines.some((line) => line.label === "Highest possible final mark")).toBe(false);
  });
});

// ── Properties over many generated modules ───────────────────────────────

/** A small seeded generator, so a failure always reproduces. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSection(next: () => number, prefix: string, section: AssessmentSection | null): GradeAssessmentInput[] {
  const count = 1 + Math.floor(next() * 5);
  const cuts = Array.from({ length: count - 1 }, () => Math.floor(next() * 101)).sort((a, b) => a - b);
  const bounds = [0, ...cuts, 100];
  return bounds.slice(1).map((end, i) => {
    const name = `${prefix}${i}`;
    const weight = end - bounds[i];
    const roll = next();
    if (roll < 0.35) return pending(name, weight, section);
    if (roll < 0.45) return missed(name, weight, section);
    if (roll < 0.75) return percent(name, weight, Math.round(next() * 1000) / 10, section);
    const max = 1 + Math.floor(next() * 100);
    return outOf(name, weight, Math.round(next() * max * 2) / 2, max, section);
  });
}

function generateModule(next: () => number): GradeModuleInput {
  if (next() < 0.5) return semester(...generateSection(next, "a", null));
  // Either semester may have no assessments yet.
  const s1 = next() < 0.2 ? [] : generateSection(next, "s1-", 1);
  const s2 = next() < 0.3 ? [] : generateSection(next, "s2-", 2);
  return fullYear(Math.floor(next() * 101), ...s1, ...s2);
}

describe("properties", () => {
  const next = random(20261005);
  const cases = Array.from({ length: 400 }, () => ({ module: generateModule(next), target: Math.floor(next() * 101) }));

  it("holds for every generated module", () => {
    for (const { module, target } of cases) {
      const summary = computeModule(module, { target });
      const context = JSON.stringify({ module, target });

      expect(summary.setup.valid, context).toBe(true);
      expect(summary.securedPoints, context).toBeGreaterThanOrEqual(0);
      expect(summary.securedPoints, context).toBeLessThanOrEqual(summary.highestPossible + 1e-9);
      expect(summary.highestPossible, context).toBeLessThanOrEqual(100 + 1e-9);
      expect(summary.markedWeight + summary.remainingWeight, context).toBeCloseTo(100, 9);

      // The parts add up to the whole.
      const fromRows = summary.rows.reduce((sum, row) => sum + (row.contribution ?? 0), 0);
      const fromSections = summary.sections.reduce((sum, s) => sum + s.securedPoints, 0);
      expect(fromRows, context).toBeCloseTo(summary.securedPoints, 9);
      expect(fromSections, context).toBeCloseTo(summary.securedPoints, 9);

      if (summary.averageSoFar === null) {
        expect(summary.markedWeight, context).toBeLessThanOrEqual(0.005);
      } else {
        expect(summary.averageSoFar, context).toBeGreaterThanOrEqual(0);
        expect(summary.averageSoFar, context).toBeLessThanOrEqual(100 + 1e-9);
      }

      const result = summary.target!;
      expect(result.status === "SECURED", context).toBe(summary.securedPoints >= target - 0.005);
      if (result.required !== null) {
        expect(result.required, context).toBeGreaterThan(0);
        expect(result.required, context).toBeLessThanOrEqual(100 + 0.005);
        // Getting exactly the required mark on everything left lands on the target.
        const projected = computeModule(module, { target, hypothetical: { all: result.required } });
        expect(projected.projection!.finalMark, context).toBeCloseTo(target, 9);
      }
    }
  });

  it("never lets what-if marks change the real figures", () => {
    for (const { module, target } of cases.slice(0, 100)) {
      const real = computeModule(module, { target });
      const whatIf = computeModule(module, { target, hypothetical: { all: Math.floor(next() * 101) } });
      expect(whatIf.securedPoints).toBe(real.securedPoints);
      expect(whatIf.markedWeight).toBe(real.markedWeight);
      expect(whatIf.remainingWeight).toBe(real.remainingWeight);
      expect(whatIf.target).toEqual(real.target);
      expect(whatIf.projection!.finalMark!).toBeGreaterThanOrEqual(real.securedPoints - 1e-9);
      expect(whatIf.projection!.finalMark!).toBeLessThanOrEqual(real.highestPossible + 1e-9);
    }
  });
});
