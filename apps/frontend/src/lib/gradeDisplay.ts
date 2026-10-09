import type { AssessmentDateKind, GradeAssessment, GradeModule } from "@logbook/shared";
import { assessmentStatus, formatWeight, type TargetStatus } from "./grades";
import { todayISO } from "./utils";
import type { Tone } from "./ui";
import { CheckCircle2, CircleSlash, Hourglass, Mountain, Target, TrendingUp, type LucideIcon } from "lucide-react";

/**
 * My Grades (FEAT-009): the presentation around the grade engine — labels,
 * calendar days and the upcoming list. No grade arithmetic lives here; every
 * mark, weight and status figure comes from lib/grades.ts.
 */

export type { Tone } from "./ui";

/**
 * How each target status is shown. The wording is deliberately calm: it says
 * what the numbers mean without judging the student, and nothing is red.
 * The statuses themselves come from the grade engine unchanged.
 */
export const TARGET_STATUS_META: Record<TargetStatus, { label: string; tone: Tone; icon: LucideIcon; description: string }> = {
  SECURED: { label: "Secured", tone: "success", icon: CheckCircle2, description: "You'll reach this target even with 0 on everything left." },
  WITHIN_REACH: { label: "On track", tone: "info", icon: TrendingUp, description: "It needs no more than your average on marked work so far." },
  STRETCH: { label: "Reachable", tone: "caution", icon: Mountain, description: "It needs more than your average so far, but it's still possible." },
  NOT_REACHABLE: { label: "Out of reach", tone: "neutral", icon: CircleSlash, description: "Even full marks on what's left wouldn't get there. A different target may help." },
  NO_TARGET: { label: "No target", tone: "neutral", icon: Target, description: "Choose a target to see what you need." },
  NOT_ENOUGH_DATA: { label: "Not enough data yet", tone: "neutral", icon: Hourglass, description: "Nothing has been marked yet, so there's no average to compare with." },
};

/** Target presets. "Pass" is only a preset: modules can have other pass rules. */
export const TARGET_PRESETS = [
  { label: "Pass (50%)", value: 50 },
  { label: "60%", value: 60 },
  { label: "70%", value: 70 },
  { label: "75%", value: 75 },
] as const;

export const UNOFFICIAL_NOTE =
  "These figures are an unofficial estimate. Your module's own rules — such as subminimums, DP requirements or rounding — may change your final result.";

export function moduleTypeLabel(module: Pick<GradeModule, "type" | "semester" | "semester1Weight">): string {
  if (module.type === "SEMESTER") return `Semester ${module.semester}`;
  if (module.semester1Weight === null) return "Full year";
  return `Full year · S1 ${formatWeight(module.semester1Weight)} / S2 ${formatWeight(100 - module.semester1Weight)}`;
}

/**
 * "3 of 5 assessments marked (1 missed) · 2 remaining", from the engine's counts.
 * Counts only: every grade figure is still weighted by each assessment's weight.
 */
export function assessmentProgress(counts: { total: number; marked: number; missed: number; remaining: number }): string {
  if (counts.total === 0) return "No assessments yet";
  const noun = counts.total === 1 ? "assessment" : "assessments";
  const missed = counts.missed > 0 ? ` (${counts.missed} missed)` : "";
  if (counts.remaining === 0) return `All ${counts.total} ${noun} marked${missed}`;
  return `${counts.marked} of ${counts.total} ${noun} marked${missed} · ${counts.remaining} remaining`;
}

export type TermFilter = "ALL" | 1 | 2;

export type YearFilter = number | "ALL";

/** The academic years the student has modules in, oldest first — never a year with nothing in it. */
export function academicYears(modules: Pick<GradeModule, "academicYear">[]): number[] {
  return [...new Set(modules.map((m) => m.academicYear))].sort((a, b) => a - b);
}

/** This year if the student has modules in it; otherwise their most recent year; otherwise all. */
export function defaultAcademicYear(years: number[], currentYear: number): YearFilter {
  if (years.includes(currentYear)) return currentYear;
  return years.length > 0 ? years[years.length - 1] : "ALL";
}

export function moduleInYear(module: Pick<GradeModule, "academicYear">, year: YearFilter): boolean {
  return year === "ALL" || module.academicYear === year;
}

/** A full-year module runs in both semesters, so it shows under either. */
export function moduleInTerm(module: Pick<GradeModule, "type" | "semester">, term: TermFilter): boolean {
  return term === "ALL" || module.type === "FULL_YEAR" || module.semester === term;
}

// ── Calendar days ────────────────────────────────────────────────────────
// Dates are plain "YYYY-MM-DD" days. They are compared as days and only
// turned into a Date at local midnight for display, so no time zone can move
// a test to the day before.

/** Whole days from today to `day`; negative once it has passed. */
export function daysUntil(day: string, today: string = todayISO()): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Sun, 15 Nov 2026" in the viewer's locale. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Wed, 7 Oct": for lists where the year is obvious. */
export function formatShortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

export const DATE_KIND_LABEL: Record<AssessmentDateKind, string> = { DUE: "Due", TEST: "Test" };

/** The date has passed but no mark has been entered. */
export function awaitingMark(assessment: GradeAssessment, today: string = todayISO()): boolean {
  return assessment.date !== null && assessmentStatus(assessment) === "PENDING" && daysUntil(assessment.date, today) < 0;
}

export interface UpcomingAssessment {
  module: GradeModule;
  assessment: GradeAssessment;
  days: number;
}

/** Unmarked assessments dated from today up to `horizon` days ahead, soonest first. */
export function upcomingAssessments(modules: GradeModule[], today: string = todayISO(), horizon = 14): UpcomingAssessment[] {
  return modules
    .flatMap((module) =>
      module.assessments
        .filter((assessment) => assessment.date !== null && assessmentStatus(assessment) === "PENDING")
        .map((assessment) => ({ module, assessment, days: daysUntil(assessment.date!, today) }))
    )
    .filter((item) => item.days >= 0 && item.days <= horizon)
    .sort((a, b) => a.days - b.days || a.module.code.localeCompare(b.module.code));
}

/** A module's next unmarked, dated assessment from today on, or null. */
export function nextAssessment(module: GradeModule, today: string = todayISO()): { assessment: GradeAssessment; days: number } | null {
  let best: { assessment: GradeAssessment; days: number } | null = null;
  for (const assessment of module.assessments) {
    if (!assessment.date || assessmentStatus(assessment) !== "PENDING") continue;
    const days = daysUntil(assessment.date, today);
    if (days >= 0 && (!best || days < best.days)) best = { assessment, days };
  }
  return best;
}

/** The message an API error carries, or a fallback. */
export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}
