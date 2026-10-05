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

/** What an assessment's date means: a deadline (DUE) or the day it is written (TEST). */
export type AssessmentDateKind = "DUE" | "TEST";

/**
 * An assessment as the API returns it: exactly what the student entered. Its
 * status, percentage and contribution are worked out by the grade engine, so
 * there is one place that derives them.
 */
export interface GradeAssessment {
  id: string;
  moduleId: string;
  name: string;
  /** 1 or 2 in a full-year module; null in a semester module. */
  section: AssessmentSection | null;
  /** Share of its section, 0–100. */
  weight: number;
  markObtained: number | null;
  markMax: number | null;
  markPercent: number | null;
  missed: boolean;
  /** A calendar day, "YYYY-MM-DD", with no time and so no time zone. */
  date: string | null;
  /** Set exactly when date is. */
  dateKind: AssessmentDateKind | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface GradeModule {
  id: string;
  code: string;
  name: string;
  academicYear: number;
  type: ModuleType;
  /** 1 or 2 for a semester module; null for a full-year module. */
  semester: AssessmentSection | null;
  /** Full-year modules only; Semester 2 counts for the rest. */
  semester1Weight: number | null;
  targetMark: number | null;
  createdAt: string;
  updatedAt: string;
  /** In the student's order. */
  assessments: GradeAssessment[];
}

export interface CreateGradeModuleInput {
  code: string;
  name: string;
  academicYear: number;
  type: ModuleType;
  semester?: AssessmentSection | null;
  semester1Weight?: number | null;
  targetMark?: number | null;
}

/** Changing type: send the field the new type needs, and null for the one it doesn't. */
export type UpdateGradeModuleInput = Partial<CreateGradeModuleInput>;

export interface CreateAssessmentInput {
  name: string;
  weight: number;
  section?: AssessmentSection | null;
  markObtained?: number | null;
  markMax?: number | null;
  markPercent?: number | null;
  missed?: boolean;
  date?: string | null;
  dateKind?: AssessmentDateKind | null;
  position?: number;
}

/**
 * The mark (markObtained, markMax, markPercent, missed) and the date (date,
 * dateKind) are each replaced as a whole: send any part of one and the parts
 * left out are cleared, so an old 25/40 can't linger beside a new 62.5%.
 */
export type UpdateAssessmentInput = Partial<CreateAssessmentInput>;
