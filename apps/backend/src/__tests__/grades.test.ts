import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import gradesRouter from "../routes/grades.routes.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// FEAT-009 (My Grades) — the grades API against the database: CRUD, what is
// stored and returned, how module types change, cascades, and that one
// student can never reach another's modules. Field validation and the route
// guards that need no database are in gradesValidation.test.ts.

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();

let HA: Record<string, string>;
let HB: Record<string, string>;

async function makeUser(id: string, email: string, name: string) {
  await prisma.user.create({
    data: { id, email, passwordHash: await hashPassword("Password123"), fullName: name, isEmailVerified: true },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

let codeCount = 0;
/** A module code no other test in this run uses. */
const uniqueCode = () => `T${ts % 100000}X${++codeCount}`;

async function semesterModule(change: Record<string, unknown> = {}, headers = HA) {
  const res = await request(app)
    .post("/api/grades/modules")
    .set(headers)
    .send({ code: uniqueCode(), name: "Software Design", academicYear: 2026, type: "SEMESTER", semester: 2, ...change });
  expect(res.status).toBe(201);
  return res.body;
}

async function fullYearModule(semester1Weight = 60) {
  const res = await request(app)
    .post("/api/grades/modules")
    .set(HA)
    .send({ code: uniqueCode(), name: "Year Module", academicYear: 2026, type: "FULL_YEAR", semester1Weight });
  expect(res.status).toBe(201);
  return res.body;
}

const addAssessment = (moduleId: string, body: Record<string, unknown>, headers = HA) =>
  request(app).post(`/api/grades/modules/${moduleId}/assessments`).set(headers).send(body);

beforeAll(async () => {
  HA = await makeUser(USER_A, `grades_a_${ts}@example.com`, "Grades A");
  HB = await makeUser(USER_B, `grades_b_${ts}@example.com`, "Grades B");
});

afterAll(async () => {
  // Cascades to their modules and assessments.
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
});

// ── Modules ──────────────────────────────────────────────────────────────

describe("modules", () => {
  it("creates a semester module and returns it as entered", async () => {
    const code = uniqueCode();
    const res = await request(app)
      .post("/api/grades/modules")
      .set(HA)
      .send({ code: ` ${code.toLowerCase()} `, name: "Discrete Maths", academicYear: 2026, type: "SEMESTER", semester: 2, targetMark: 75 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code,
      name: "Discrete Maths",
      academicYear: 2026,
      type: "SEMESTER",
      semester: 2,
      semester1Weight: null,
      targetMark: 75,
      assessments: [],
    });
  });

  it("creates a full-year module with the student's own split", async () => {
    const module = await fullYearModule(70);
    expect(module).toMatchObject({ type: "FULL_YEAR", semester: null, semester1Weight: 70 });
  });

  it("refuses a full-year module without a Semester 1 weighting", async () => {
    const res = await request(app)
      .post("/api/grades/modules")
      .set(HA)
      .send({ code: uniqueCode(), name: "X", academicYear: 2026, type: "FULL_YEAR" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Semester 1's weighting/);
  });

  it("refuses the same code twice in a year, whatever its case", async () => {
    const module = await semesterModule();
    const res = await request(app)
      .post("/api/grades/modules")
      .set(HA)
      .send({ code: module.code.toLowerCase(), name: "Again", academicYear: 2026, type: "SEMESTER", semester: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`You already have ${module.code} in 2026`);
  });

  it("allows repeating a module in a later year", async () => {
    const module = await semesterModule();
    const res = await request(app)
      .post("/api/grades/modules")
      .set(HA)
      .send({ code: module.code, name: "Repeat", academicYear: 2027, type: "SEMESTER", semester: 2 });
    expect(res.status).toBe(201);
  });

  it("lets two students use the same code", async () => {
    const module = await semesterModule();
    await semesterModule({ code: module.code }, HB);
  });

  it("lists only the caller's modules, filtered by year", async () => {
    const mine = await semesterModule({ academicYear: 2031 });
    const theirs = await semesterModule({ academicYear: 2031 }, HB);
    const res = await request(app).get("/api/grades/modules?year=2031").set(HA);
    expect(res.status).toBe(200);
    const ids = res.body.map((m: { id: string }) => m.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    expect(res.body.every((m: { academicYear: number }) => m.academicYear === 2031)).toBe(true);
  });

  it.each(["abc", "2026.5", "1999"])("rejects ?year=%s", async (year) => {
    const res = await request(app).get(`/api/grades/modules?year=${year}`).set(HA);
    expect(res.status).toBe(400);
  });

  it("updates details and the target", async () => {
    const module = await semesterModule();
    const res = await request(app)
      .patch(`/api/grades/modules/${module.id}`)
      .set(HA)
      .send({ name: "Renamed", targetMark: 60.5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Renamed", targetMark: 60.5, semester: 2 });
  });

  it("clears the target with null", async () => {
    const module = await semesterModule({ targetMark: 70 });
    const res = await request(app).patch(`/api/grades/modules/${module.id}`).set(HA).send({ targetMark: null });
    expect(res.body.targetMark).toBeNull();
  });

  it("refuses a rename onto an existing code", async () => {
    const first = await semesterModule();
    const second = await semesterModule();
    const res = await request(app).patch(`/api/grades/modules/${second.id}`).set(HA).send({ code: first.code });
    expect(res.status).toBe(409);
  });

  it("deletes a module and its assessments", async () => {
    const module = await semesterModule();
    const assessment = (await addAssessment(module.id, { name: "Exam", weight: 100 })).body;
    expect((await request(app).delete(`/api/grades/modules/${module.id}`).set(HA)).status).toBe(204);
    expect((await request(app).get(`/api/grades/modules/${module.id}`).set(HA)).status).toBe(404);
    expect(await prisma.assessment.count({ where: { id: assessment.id } })).toBe(0);
  });
});

// ── Changing a module's type ─────────────────────────────────────────────

describe("changing module type", () => {
  it("moves a semester module's assessments into the semester it ran in", async () => {
    const module = await semesterModule({ semester: 2 });
    await addAssessment(module.id, { name: "Test", weight: 100 });
    const res = await request(app)
      .patch(`/api/grades/modules/${module.id}`)
      .set(HA)
      .send({ type: "FULL_YEAR", semester: null, semester1Weight: 40 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "FULL_YEAR", semester: null, semester1Weight: 40 });
    expect(res.body.assessments[0].section).toBe(2);
  });

  it("needs the field the new type requires", async () => {
    const module = await semesterModule();
    const res = await request(app).patch(`/api/grades/modules/${module.id}`).set(HA).send({ type: "FULL_YEAR" });
    expect(res.status).toBe(400);
  });

  it("turns a full-year module with one semester's assessments into a semester module", async () => {
    const module = await fullYearModule();
    await addAssessment(module.id, { name: "Test", weight: 100, section: 1 });
    const res = await request(app)
      .patch(`/api/grades/modules/${module.id}`)
      .set(HA)
      .send({ type: "SEMESTER", semester: 1, semester1Weight: null });
    expect(res.status).toBe(200);
    expect(res.body.assessments[0].section).toBeNull();
  });

  it("refuses while assessments are in both semesters, changing nothing", async () => {
    const module = await fullYearModule();
    await addAssessment(module.id, { name: "S1", weight: 100, section: 1 });
    await addAssessment(module.id, { name: "S2", weight: 100, section: 2 });
    const res = await request(app)
      .patch(`/api/grades/modules/${module.id}`)
      .set(HA)
      .send({ type: "SEMESTER", semester: 1, semester1Weight: null });
    expect(res.status).toBe(409);
    const after = (await request(app).get(`/api/grades/modules/${module.id}`).set(HA)).body;
    expect(after.type).toBe("FULL_YEAR");
    expect(after.assessments.map((a: { section: number }) => a.section).sort()).toEqual([1, 2]);
  });
});

// ── Assessments ──────────────────────────────────────────────────────────

describe("assessments", () => {
  it("keeps 25 / 40 exactly as entered", async () => {
    const module = await semesterModule();
    const res = await addAssessment(module.id, { name: "Midterm", weight: 40, markObtained: 25, markMax: 40 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      moduleId: module.id,
      name: "Midterm",
      section: null,
      weight: 40,
      markObtained: 25,
      markMax: 40,
      markPercent: null,
      missed: false,
      date: null,
      dateKind: null,
    });
    expect(res.body).not.toHaveProperty("status"); // derived by the grade engine, not the API
  });

  it("keeps a percentage, a missed assessment and fractional weights", async () => {
    const module = await semesterModule();
    expect((await addAssessment(module.id, { name: "Tut", weight: 33.33, markPercent: 62.5 })).body).toMatchObject({
      weight: 33.33,
      markPercent: 62.5,
    });
    expect((await addAssessment(module.id, { name: "Quiz", weight: 10, missed: true })).body.missed).toBe(true);
  });

  it("stores a date as the same calendar day it was given", async () => {
    const module = await semesterModule();
    const res = await addAssessment(module.id, { name: "Final Test", weight: 30, date: "2026-11-15", dateKind: "TEST" });
    expect(res.body).toMatchObject({ date: "2026-11-15", dateKind: "TEST" });
    const fetched = (await request(app).get(`/api/grades/modules/${module.id}`).set(HA)).body;
    expect(fetched.assessments[0].date).toBe("2026-11-15");
  });

  it.each([
    [{ markObtained: 41, markMax: 40 }, /can't be more than the maximum/],
    [{ markObtained: 25, markMax: 40, markPercent: 62.5 }, /not both/],
    [{ missed: true, markPercent: 50 }, /missed assessment can't also have a mark/],
    [{ markMax: 0, markObtained: 0 }, /more than 0/],
    [{ date: "2026-11-15" }, /due date or a test date/],
    [{ section: 1 }, /don't belong to a separate semester/],
  ])("refuses %j in a semester module", async (change, message) => {
    const module = await semesterModule();
    const res = await addAssessment(module.id, { name: "X", weight: 10, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("needs a semester in a full-year module", async () => {
    const module = await fullYearModule();
    const res = await addAssessment(module.id, { name: "X", weight: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Choose which semester/);
  });

  it("adds new assessments at the end, in order", async () => {
    const module = await semesterModule();
    await addAssessment(module.id, { name: "First", weight: 10 });
    await addAssessment(module.id, { name: "Second", weight: 10 });
    const fetched = (await request(app).get(`/api/grades/modules/${module.id}`).set(HA)).body;
    expect(fetched.assessments.map((a: { name: string; position: number }) => [a.name, a.position])).toEqual([
      ["First", 0],
      ["Second", 1],
    ]);
  });

  it("replaces the whole mark when any part of it changes", async () => {
    const module = await semesterModule();
    const created = (await addAssessment(module.id, { name: "Midterm", weight: 40, markObtained: 25, markMax: 40 })).body;
    const res = await request(app).patch(`/api/grades/assessments/${created.id}`).set(HA).send({ markPercent: 62.5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ markObtained: null, markMax: null, markPercent: 62.5, missed: false });
  });

  it("keeps the mark and date when other fields change", async () => {
    const module = await semesterModule();
    const created = (
      await addAssessment(module.id, {
        name: "Midterm",
        weight: 40,
        markObtained: 25,
        markMax: 40,
        date: "2026-08-20",
        dateKind: "TEST",
      })
    ).body;
    const res = await request(app).patch(`/api/grades/assessments/${created.id}`).set(HA).send({ name: "Mid-semester test" });
    expect(res.body).toMatchObject({ name: "Mid-semester test", markObtained: 25, markMax: 40, date: "2026-08-20", dateKind: "TEST" });
  });

  it("clears a date as a whole, and records a missed assessment", async () => {
    const module = await semesterModule();
    const created = (await addAssessment(module.id, { name: "Quiz", weight: 10, date: "2026-09-01", dateKind: "DUE" })).body;
    const cleared = await request(app).patch(`/api/grades/assessments/${created.id}`).set(HA).send({ date: null });
    expect(cleared.body).toMatchObject({ date: null, dateKind: null });
    const missed = await request(app).patch(`/api/grades/assessments/${created.id}`).set(HA).send({ missed: true });
    expect(missed.body).toMatchObject({ missed: true, markPercent: null });
  });

  it("deletes an assessment", async () => {
    const module = await semesterModule();
    const created = (await addAssessment(module.id, { name: "Gone", weight: 10 })).body;
    expect((await request(app).delete(`/api/grades/assessments/${created.id}`).set(HA)).status).toBe(204);
    expect((await request(app).delete(`/api/grades/assessments/${created.id}`).set(HA)).status).toBe(404);
  });
});

// ── Ownership ────────────────────────────────────────────────────────────

describe("ownership", () => {
  /** Every grades route, read from the router so a new one is checked automatically. */
  const routes: { method: string; path: string }[] = [];
  for (const layer of (gradesRouter as any).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) routes.push({ method, path: layer.route.path });
  }
  const owned = routes.filter((route) => route.path.includes(":"));

  it("checks every route that names a record", () => {
    expect(owned.length).toBe(6);
  });

  it.each(owned.map((r) => [r.method.toUpperCase(), r.path, r.method]))(
    "%s %s is not found for another student, and changes nothing",
    async (_label, path, method) => {
      const module = await semesterModule({ targetMark: 50 });
      const assessment = (await addAssessment(module.id, { name: "Private", weight: 100, markPercent: 70 })).body;
      const url = `/api/grades${path.replace(":moduleId", module.id).replace(":assessmentId", assessment.id)}`;

      const res = await (request(app) as any)[method](url).set(HB).send({ name: "Taken", weight: 1, targetMark: 1 });
      expect(res.status).toBe(404);

      const after = (await request(app).get(`/api/grades/modules/${module.id}`).set(HA)).body;
      expect(after).toMatchObject({ name: "Software Design", targetMark: 50 });
      expect(after.assessments).toHaveLength(1);
      expect(after.assessments[0]).toMatchObject({ name: "Private", weight: 100, markPercent: 70 });
    }
  );

  it("doesn't list another student's modules", async () => {
    const theirs = await semesterModule({}, HB);
    const mine = (await request(app).get("/api/grades/modules").set(HA)).body;
    expect(mine.map((m: { id: string }) => m.id)).not.toContain(theirs.id);
  });
});

// ── Account deletion ─────────────────────────────────────────────────────

describe("account deletion", () => {
  it("removes the student's modules and assessments", async () => {
    const id = crypto.randomUUID();
    const headers = await makeUser(id, `grades_c_${ts}@example.com`, "Grades C");
    const module = await semesterModule({}, headers);
    await addAssessment(module.id, { name: "Exam", weight: 100 }, headers);
    await prisma.user.delete({ where: { id } });
    expect(await prisma.academicModule.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.assessment.count({ where: { moduleId: module.id } })).toBe(0);
  });
});
