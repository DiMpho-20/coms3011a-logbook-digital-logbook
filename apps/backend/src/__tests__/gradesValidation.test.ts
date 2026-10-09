import { describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import gradesRouter from "../routes/grades.routes.js";
import { generateToken } from "../utils/auth.js";
import {
  assessmentProblem,
  createAssessmentSchema,
  createModuleSchema,
  daySchema,
  moduleShapeProblem,
  updateAssessmentSchema,
  updateModuleSchema,
  type AssessmentShape,
} from "../schemas/grades.schema.js";

// FEAT-009 (My Grades) — everything that can be checked without the database:
// field validation, how fields fit together, and the guards every grades
// route sits behind. Requests here are all turned away (401, or 404 for a
// malformed id) before any query runs. grades.test.ts covers the rest.

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0].message;

// ── Modules ──────────────────────────────────────────────────────────────

describe("module validation", () => {
  const valid = { code: " coms3011a ", name: "Software Design", academicYear: 2026, type: "SEMESTER", semester: 2 };

  it("trims and upper-cases the code", () => {
    const parsed = createModuleSchema.parse(valid);
    expect(parsed.code).toBe("COMS3011A");
  });

  it.each([
    [{ code: "" }, "code is required"],
    [{ code: "X".repeat(21) }, "code can be at most 20 characters"],
    [{ name: "  " }, "name is required"],
    [{ academicYear: 1999 }, "academicYear must be between 2000 and 2100"],
    [{ academicYear: 2026.5 }, "academicYear must be a year such as 2026"],
    [{ type: "QUARTER" }, "type must be SEMESTER or FULL_YEAR"],
    [{ semester: 3 }, "section must be 1 or 2"],
    [{ semester1Weight: 101 }, "semester1Weight must be between 0 and 100"],
    [{ semester1Weight: 33.333 }, "semester1Weight can have at most two decimal places"],
    [{ targetMark: -1 }, "targetMark must be between 0 and 100"],
  ])("rejects %j", (change, message) => {
    expect(firstError(createModuleSchema.safeParse({ ...valid, ...change }))).toBe(message);
  });

  it("rejects an empty update", () => {
    expect(firstError(updateModuleSchema.safeParse({}))).toBe("Nothing to update");
  });

  it("needs a semester for a semester module, and no Semester 1 weighting", () => {
    expect(moduleShapeProblem({ type: "SEMESTER", semester: 2, semester1Weight: null })).toBeNull();
    expect(moduleShapeProblem({ type: "SEMESTER", semester: null, semester1Weight: null })).toBe(
      "A semester module needs its semester (1 or 2)"
    );
    expect(moduleShapeProblem({ type: "SEMESTER", semester: 1, semester1Weight: 60 })).toBe(
      "Only a full-year module has a Semester 1 weighting"
    );
  });

  it("needs a Semester 1 weighting for a full-year module, with no default split", () => {
    expect(moduleShapeProblem({ type: "FULL_YEAR", semester: null, semester1Weight: 60 })).toBeNull();
    expect(moduleShapeProblem({ type: "FULL_YEAR", semester: null, semester1Weight: 0 })).toBeNull();
    expect(moduleShapeProblem({ type: "FULL_YEAR", semester: null, semester1Weight: null })).toBe(
      "A full-year module needs Semester 1's weighting (Semester 2 counts for the rest)"
    );
    expect(moduleShapeProblem({ type: "FULL_YEAR", semester: 1, semester1Weight: 60 })).toBe(
      "A full-year module runs in both semesters, so it has no single semester"
    );
  });
});

// ── Assessments ──────────────────────────────────────────────────────────

describe("assessment validation", () => {
  it.each([
    [{ weight: 100.5 }, "weight must be between 0 and 100"],
    [{ weight: 12.345 }, "weight can have at most two decimal places"],
    [{ markMax: 0 }, "markMax must be more than 0"],
    [{ markObtained: -1 }, "markObtained must be between 0 and 99999.99"],
    [{ markPercent: 100.01 }, "markPercent must be between 0 and 100"],
    [{ missed: "yes" }, "missed must be true or false"],
    [{ date: "15/11/2026" }, "date must be a date like 2026-11-15"],
    [{ date: "2026-02-30" }, "date is not a real calendar day"],
    [{ dateKind: "EXAM" }, "dateKind must be DUE or TEST"],
    [{ name: "" }, "name is required"],
    [{ position: -1 }, "position must be between 0 and 10000"],
  ])("rejects %j", (change, message) => {
    expect(firstError(createAssessmentSchema.safeParse({ name: "Exam", weight: 40, ...change }))).toBe(message);
  });

  it("accepts real days, leap days included", () => {
    expect(daySchema.safeParse("2026-11-15").success).toBe(true);
    expect(daySchema.safeParse("2028-02-29").success).toBe(true);
    expect(daySchema.safeParse("2026-02-29").success).toBe(false);
    expect(daySchema.safeParse("2026-11-15T00:00:00Z").success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(firstError(updateAssessmentSchema.safeParse({}))).toBe("Nothing to update");
  });

  const shape = (change: Partial<AssessmentShape> = {}): AssessmentShape => ({
    section: null,
    markObtained: null,
    markMax: null,
    markPercent: null,
    missed: false,
    date: null,
    dateKind: null,
    ...change,
  });

  it("accepts each way of recording a mark, or none", () => {
    expect(assessmentProblem(shape(), "SEMESTER")).toBeNull();
    expect(assessmentProblem(shape({ markObtained: 25, markMax: 40 }), "SEMESTER")).toBeNull();
    expect(assessmentProblem(shape({ markPercent: 62.5 }), "SEMESTER")).toBeNull();
    expect(assessmentProblem(shape({ missed: true }), "SEMESTER")).toBeNull();
    expect(assessmentProblem(shape({ markObtained: 40, markMax: 40 }), "SEMESTER")).toBeNull();
  });

  it.each([
    [{ missed: true, markPercent: 50 }, "A missed assessment can't also have a mark"],
    [{ markObtained: 25, markMax: 40, markPercent: 62.5 }, "Enter the mark either out of a maximum or as a percentage, not both"],
    [{ markObtained: 25 }, "Enter both the mark obtained and the maximum mark"],
    [{ markMax: 40 }, "Enter both the mark obtained and the maximum mark"],
    [{ markObtained: 41, markMax: 40 }, "The mark obtained can't be more than the maximum mark"],
    [{ date: "2026-11-15" }, "Say whether the date is a due date or a test date"],
    [{ dateKind: "TEST" as const }, "A date type needs a date"],
  ])("rejects %j", (change, message) => {
    expect(assessmentProblem(shape(change), "SEMESTER")).toBe(message);
  });

  it("matches the assessment's section to the module type", () => {
    expect(assessmentProblem(shape({ section: 1 }), "FULL_YEAR")).toBeNull();
    expect(assessmentProblem(shape(), "FULL_YEAR")).toBe("Choose which semester this assessment belongs to (1 or 2)");
    expect(assessmentProblem(shape({ section: 2 }), "SEMESTER")).toBe(
      "Assessments in a semester module don't belong to a separate semester"
    );
  });
});

// ── Route guards ─────────────────────────────────────────────────────────

/** Every route on the grades router, read from the router itself so a new one can't be missed. */
function gradesRoutes(): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  for (const layer of (gradesRouter as any).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      routes.push({ method, path: layer.route.path as string });
    }
  }
  return routes;
}

const withIds = (path: string, id: string) => `/api/grades${path.replace(/:(moduleId|assessmentId)/g, id)}`;

describe("grades route guards", () => {
  const routes = gradesRoutes();

  it("finds the routes to check", () => {
    expect(routes.length).toBe(8);
  });

  it("only names ids that have an ownership loader", () => {
    for (const { path } of routes) {
      const params = path.match(/:[A-Za-z]+/g) ?? [];
      for (const param of params) expect([":moduleId", ":assessmentId"], path).toContain(param);
    }
  });

  it.each(routes.map((r) => [r.method.toUpperCase(), r.path, r.method]))(
    "%s %s needs a signed-in student",
    async (_label, path, method) => {
      const res = await (request(app) as any)[method](withIds(path, crypto.randomUUID())).send({});
      expect(res.status).toBe(401);
    }
  );

  it.each(routes.filter((r) => r.path.includes(":")).map((r) => [r.method.toUpperCase(), r.path, r.method]))(
    "%s %s treats a malformed id as not found",
    async (_label, path, method) => {
      const auth = { Authorization: `Bearer ${generateToken(crypto.randomUUID())}` };
      const res = await (request(app) as any)[method](withIds(path, "not-a-uuid")).set(auth).send({});
      expect(res.status).toBe(404);
    }
  );

  it("doesn't put routes outside /api/grades behind its sign-in check", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});
