// My Grades (FEAT-009) — types shared by the grade calculation engine and the
// grades API.

/**
 * A semester module stands on its own: its assessments make up 100% of it.
 * A full-year module is split between Semester 1 and Semester 2 in a
 * proportion the student sets; nothing assumes 50/50.
 */
export type ModuleType = "SEMESTER" | "FULL_YEAR";

/** The half of a full-year module an assessment belongs to. Semester modules have none. */
export type AssessmentSection = 1 | 2;

/**
 * Worked out from the assessment, never stored: a mark makes it GRADED, the
 * missed flag makes it MISSED (counted as 0%), and otherwise it is PENDING.
 */
export type AssessmentStatus = "PENDING" | "GRADED" | "MISSED";
