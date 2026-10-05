import { z } from "zod";

// FEAT-009 (My Grades). The Zod schemas check each field on its own; the
// *Problem functions below check how fields fit together, and run on the
// record as it will be after the change (current values merged with the
// request), so a PATCH can't leave a module or assessment half-valid.

const atMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** A number between min and max with at most two decimal places, as the DECIMAL columns hold. */
function decimal(label: string, min: number, max: number) {
  return z
    .number({ message: `${label} must be a number` })
    .min(min, `${label} must be between ${min} and ${max}`)
    .max(max, `${label} must be between ${min} and ${max}`)
    .refine(atMostTwoDecimals, { message: `${label} can have at most two decimal places` });
}

const percentage = (label: string) => decimal(label, 0, 100);

const section = z.union([z.literal(1), z.literal(2)], { message: "section must be 1 or 2" });

/** A real calendar day as "YYYY-MM-DD" — 2026-02-30 is turned away, not rolled over. */
export const daySchema = z
  .string({ message: "date must be a date like 2026-11-15" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be a date like 2026-11-15")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, { message: "date is not a real calendar day" });

export const academicYearSchema = z
  .number({ message: "academicYear must be a year such as 2026" })
  .int("academicYear must be a year such as 2026")
  .min(2000, "academicYear must be between 2000 and 2100")
  .max(2100, "academicYear must be between 2000 and 2100");

// ── Modules ──────────────────────────────────────────────────────────────

const moduleFields = {
  code: z
    .string({ message: "code is required" })
    .trim()
    .min(1, "code is required")
    .max(20, "code can be at most 20 characters")
    .transform((code) => code.toUpperCase()),
  name: z.string({ message: "name is required" }).trim().min(1, "name is required").max(255, "name is too long"),
  academicYear: academicYearSchema,
  type: z.enum(["SEMESTER", "FULL_YEAR"], { message: "type must be SEMESTER or FULL_YEAR" }),
  semester: section.nullable(),
  semester1Weight: percentage("semester1Weight").nullable(),
  targetMark: percentage("targetMark").nullable(),
};

export const createModuleSchema = z.object({
  code: moduleFields.code,
  name: moduleFields.name,
  academicYear: moduleFields.academicYear,
  type: moduleFields.type,
  semester: moduleFields.semester.optional(),
  semester1Weight: moduleFields.semester1Weight.optional(),
  targetMark: moduleFields.targetMark.optional(),
});

export const updateModuleSchema = z
  .object({
    code: moduleFields.code.optional(),
    name: moduleFields.name.optional(),
    academicYear: moduleFields.academicYear.optional(),
    type: moduleFields.type.optional(),
    semester: moduleFields.semester.optional(),
    semester1Weight: moduleFields.semester1Weight.optional(),
    targetMark: moduleFields.targetMark.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Nothing to update" });

export interface ModuleShape {
  type: "SEMESTER" | "FULL_YEAR";
  semester: number | null;
  semester1Weight: number | null;
}

/**
 * A semester module runs in one semester; a full-year module runs in both and
 * says how Semester 1 counts. There is deliberately no default split.
 */
export function moduleShapeProblem(module: ModuleShape): string | null {
  if (module.type === "SEMESTER") {
    if (module.semester === null) return "A semester module needs its semester (1 or 2)";
    if (module.semester1Weight !== null) return "Only a full-year module has a Semester 1 weighting";
  } else {
    if (module.semester1Weight === null) {
      return "A full-year module needs Semester 1's weighting (Semester 2 counts for the rest)";
    }
    if (module.semester !== null) return "A full-year module runs in both semesters, so it has no single semester";
  }
  return null;
}

// ── Assessments ──────────────────────────────────────────────────────────

const assessmentFields = {
  name: z.string({ message: "name is required" }).trim().min(1, "name is required").max(120, "name is too long"),
  weight: percentage("weight"),
  section: section.nullable(),
  markObtained: decimal("markObtained", 0, 99999.99).nullable(),
  markMax: decimal("markMax", 0, 99999.99)
    .refine((max) => max > 0, { message: "markMax must be more than 0" })
    .nullable(),
  markPercent: percentage("markPercent").nullable(),
  missed: z.boolean({ message: "missed must be true or false" }),
  date: daySchema.nullable(),
  dateKind: z.enum(["DUE", "TEST"], { message: "dateKind must be DUE or TEST" }).nullable(),
  position: z
    .number({ message: "position must be a whole number" })
    .int("position must be a whole number")
    .min(0, "position must be between 0 and 10000")
    .max(10_000, "position must be between 0 and 10000"),
};

export const createAssessmentSchema = z.object({
  name: assessmentFields.name,
  weight: assessmentFields.weight,
  section: assessmentFields.section.optional(),
  markObtained: assessmentFields.markObtained.optional(),
  markMax: assessmentFields.markMax.optional(),
  markPercent: assessmentFields.markPercent.optional(),
  missed: assessmentFields.missed.optional(),
  date: assessmentFields.date.optional(),
  dateKind: assessmentFields.dateKind.optional(),
  position: assessmentFields.position.optional(),
});

export const updateAssessmentSchema = z
  .object({
    name: assessmentFields.name.optional(),
    weight: assessmentFields.weight.optional(),
    section: assessmentFields.section.optional(),
    markObtained: assessmentFields.markObtained.optional(),
    markMax: assessmentFields.markMax.optional(),
    markPercent: assessmentFields.markPercent.optional(),
    missed: assessmentFields.missed.optional(),
    date: assessmentFields.date.optional(),
    dateKind: assessmentFields.dateKind.optional(),
    position: assessmentFields.position.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Nothing to update" });

/** The fields that together make up an assessment's mark; a PATCH replaces them as one. */
export const MARK_FIELDS = ["markObtained", "markMax", "markPercent", "missed"] as const;
/** The fields that together make up an assessment's date; a PATCH replaces them as one. */
export const DATE_FIELDS = ["date", "dateKind"] as const;

export interface AssessmentShape {
  section: number | null;
  markObtained: number | null;
  markMax: number | null;
  markPercent: number | null;
  missed: boolean;
  date: string | null;
  dateKind: "DUE" | "TEST" | null;
}

/** How an assessment's fields fit together, and with the type of module it belongs to. */
export function assessmentProblem(assessment: AssessmentShape, moduleType: ModuleShape["type"]): string | null {
  if (moduleType === "FULL_YEAR" && assessment.section === null) {
    return "Choose which semester this assessment belongs to (1 or 2)";
  }
  if (moduleType === "SEMESTER" && assessment.section !== null) {
    return "Assessments in a semester module don't belong to a separate semester";
  }

  const { markObtained, markMax, markPercent, missed } = assessment;
  const hasFraction = markObtained !== null || markMax !== null;
  const hasPercent = markPercent !== null;
  if (missed && (hasFraction || hasPercent)) return "A missed assessment can't also have a mark";
  if (hasFraction && hasPercent) return "Enter the mark either out of a maximum or as a percentage, not both";
  if (hasFraction) {
    if (markObtained === null || markMax === null) return "Enter both the mark obtained and the maximum mark";
    if (markObtained > markMax) return "The mark obtained can't be more than the maximum mark";
  }

  if (assessment.date !== null && assessment.dateKind === null) {
    return "Say whether the date is a due date or a test date";
  }
  if (assessment.date === null && assessment.dateKind !== null) return "A date type needs a date";
  return null;
}
