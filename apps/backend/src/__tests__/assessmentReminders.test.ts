import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";
import { generateReminders } from "../utils/reminders.js";

// FEAT-009 Phase 4 — reminders 5 and 2 days before a dated assessment, made
// by the existing reminder rules. The rule is run at fixed moments with
// generateReminders(userId, now), so nothing depends on today's date.

const ts = Date.now();
const users: string[] = [];

/** A test on 15 November, seen from 09:00 UTC on the given day of November. */
const TEST_DAY = "2026-11-15";
const at = (day: number, time = "09:00") => new Date(`2026-11-${String(day).padStart(2, "0")}T${time}:00.000Z`);

async function student(label: string, settings: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  users.push(id);
  await prisma.user.create({
    data: {
      id,
      email: `assess_rem_${label}_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: `Assessment reminders ${label}`,
      isEmailVerified: true,
    },
  });
  await prisma.reminderSettings.create({ data: { userId: id, timeZone: "UTC", ...settings } });
  const headers = { Authorization: `Bearer ${generateToken(id)}` };
  const module = await request(app)
    .post("/api/grades/modules")
    .set(headers)
    .send({ code: `R${label.toUpperCase().slice(0, 8)}`, name: "Reminders", academicYear: 2026, type: "SEMESTER", semester: 2 });
  expect(module.status).toBe(201);
  return { id, headers, moduleId: module.body.id as string, code: module.body.code as string };
}

async function addAssessment(s: { headers: Record<string, string>; moduleId: string }, body: Record<string, unknown>) {
  const res = await request(app)
    .post(`/api/grades/modules/${s.moduleId}/assessments`)
    .set(s.headers)
    .send({ name: "Final Test", weight: 10, date: TEST_DAY, dateKind: "TEST", ...body });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const remindersFor = (assessmentId: string) =>
  prisma.reminder.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } });
const pendingFor = async (assessmentId: string) =>
  (await remindersFor(assessmentId)).filter((r) => r.status === "PENDING");

let A: Awaited<ReturnType<typeof student>>;

beforeAll(async () => {
  A = await student("main");
});

afterAll(async () => {
  // Cascades to modules, assessments, reminders and settings.
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("the 5-day and 2-day reminders", () => {
  it("starts 5 days before, not earlier, and is made once", async () => {
    const id = await addAssessment(A, { name: "Five Day" });
    await generateReminders(A.id, at(9));
    expect(await remindersFor(id)).toHaveLength(0);

    await generateReminders(A.id, at(10));
    await generateReminders(A.id, at(10, "15:00"));
    const reminders = await remindersFor(id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      source: "ASSESSMENT",
      status: "PENDING",
      ruleKey: `assessment:${id}:${TEST_DAY}:5`,
      title: `Test on Sun 15 Nov: ${A.code} Five Day`,
      entryId: null,
    });
  });

  it("keeps the same 5-day reminder until 3 days before", async () => {
    const id = await addAssessment(A, { name: "Keeps" });
    await generateReminders(A.id, at(10));
    const [first] = await remindersFor(id);
    await generateReminders(A.id, at(11));
    await generateReminders(A.id, at(12));
    const after = await pendingFor(id);
    expect(after.map((r) => r.id)).toEqual([first.id]);
  });

  it("replaces it with the 2-day reminder, which lasts until the day", async () => {
    const id = await addAssessment(A, { name: "Swaps" });
    await generateReminders(A.id, at(10));
    await generateReminders(A.id, at(13));
    const two = await pendingFor(id);
    expect(two).toHaveLength(1);
    expect(two[0].ruleKey).toBe(`assessment:${id}:${TEST_DAY}:2`);

    await generateReminders(A.id, at(15));
    expect((await pendingFor(id)).map((r) => r.id)).toEqual([two[0].id]);

    await generateReminders(A.id, at(16));
    expect(await pendingFor(id)).toHaveLength(0);
  });

  it("makes exactly two reminders over the whole run-up, so at most two notifications", async () => {
    const id = await addAssessment(A, { name: "Twice" });
    const seen = new Set<string>();
    for (let day = 8; day <= 16; day++) {
      await generateReminders(A.id, at(day));
      for (const r of await remindersFor(id)) seen.add(r.id);
    }
    expect(seen.size).toBe(2);
  });

  it("covers an assessment added late with the reminder for that point", async () => {
    const id = await addAssessment(A, { name: "Late", date: "2026-11-11" });
    await generateReminders(A.id, at(10));
    const [reminder] = await pendingFor(id);
    expect(reminder.ruleKey).toBe(`assessment:${id}:2026-11-11:2`);
  });
});

describe("timing", () => {
  it("waits for 08:00, and doesn't remake one overnight", async () => {
    const id = await addAssessment(A, { name: "Morning" });
    await generateReminders(A.id, at(10, "07:59"));
    expect(await remindersFor(id)).toHaveLength(0);

    await generateReminders(A.id, at(10, "08:00"));
    const [made] = await remindersFor(id);
    await prisma.reminder.update({ where: { id: made.id }, data: { pushedAt: at(10, "08:01") } });

    // Before 08:00 the next day: the reminder still applies, so it is left alone
    // rather than deleted and made — and pushed — again.
    await generateReminders(A.id, at(11, "03:00"));
    const after = await remindersFor(id);
    expect(after.map((r) => r.id)).toEqual([made.id]);
    expect(after[0].pushedAt).toEqual(at(10, "08:01"));
  });

  it("counts days and the hour in the student's own time zone", async () => {
    const joburg = await student("joburg", { timeZone: "Africa/Johannesburg" });
    const utc = await student("utc");
    const inJoburg = await addAssessment(joburg, {});
    const inUtc = await addAssessment(utc, {});
    // 06:30 UTC is 08:30 in Johannesburg: morning there, not yet in UTC.
    const instant = at(10, "06:30");
    await generateReminders(joburg.id, instant);
    await generateReminders(utc.id, instant);
    expect(await remindersFor(inJoburg)).toHaveLength(1);
    expect(await remindersFor(inUtc)).toHaveLength(0);
  });
});

describe("when the reminder no longer applies", () => {
  it("is completed once the assessment is marked", async () => {
    const id = await addAssessment(A, { name: "Marked" });
    await generateReminders(A.id, at(10));
    await request(app).patch(`/api/grades/assessments/${id}`).set(A.headers).send({ markPercent: 70 }).expect(200);
    await generateReminders(A.id, at(11));
    const [reminder] = await remindersFor(id);
    expect(reminder.status).toBe("COMPLETED");
  });

  it("is completed once the assessment is recorded as missed", async () => {
    const id = await addAssessment(A, { name: "Missed" });
    await generateReminders(A.id, at(10));
    await request(app).patch(`/api/grades/assessments/${id}`).set(A.headers).send({ missed: true }).expect(200);
    await generateReminders(A.id, at(11));
    expect((await remindersFor(id))[0].status).toBe("COMPLETED");
  });

  it("follows a changed date", async () => {
    const id = await addAssessment(A, { name: "Moved" });
    await generateReminders(A.id, at(10));
    await request(app).patch(`/api/grades/assessments/${id}`).set(A.headers)
      .send({ date: "2026-11-12", dateKind: "TEST" }).expect(200);
    await generateReminders(A.id, at(10, "10:00"));
    const pending = await pendingFor(id);
    expect(pending).toHaveLength(1);
    expect(pending[0].ruleKey).toBe(`assessment:${id}:2026-11-12:2`);
    expect(pending[0].title).toBe(`Test on Thu 12 Nov: ${A.code} Moved`);
  });

  it("goes when the student turns reminders off for that assessment", async () => {
    const id = await addAssessment(A, { name: "Quiet" });
    await generateReminders(A.id, at(10));
    await request(app).patch(`/api/grades/assessments/${id}`).set(A.headers).send({ remind: false }).expect(200);
    await generateReminders(A.id, at(11));
    expect(await remindersFor(id)).toHaveLength(0);
  });

  it("is never made for an assessment with reminders off, undated, or already marked", async () => {
    const off = await addAssessment(A, { name: "Off", remind: false });
    const undated = await addAssessment(A, { name: "Undated", date: null, dateKind: null });
    const marked = await addAssessment(A, { name: "Already", markPercent: 80 });
    await generateReminders(A.id, at(10));
    for (const id of [off, undated, marked]) expect(await remindersFor(id)).toHaveLength(0);
  });

  it("goes with its assessment", async () => {
    const id = await addAssessment(A, { name: "Deleted" });
    await generateReminders(A.id, at(10));
    expect(await remindersFor(id)).toHaveLength(1);
    await request(app).delete(`/api/grades/assessments/${id}`).set(A.headers).expect(204);
    expect(await prisma.reminder.count({ where: { ruleKey: { startsWith: `assessment:${id}:` } } })).toBe(0);
  });

  it("stays dismissed, and the 2-day reminder still comes", async () => {
    const id = await addAssessment(A, { name: "Dismissed" });
    await generateReminders(A.id, at(10));
    const [five] = await remindersFor(id);
    await request(app).patch(`/api/reminders/${five.id}`).set(A.headers).send({ status: "DISMISSED" }).expect(200);

    await generateReminders(A.id, at(12));
    expect(await pendingFor(id)).toHaveLength(0);

    await generateReminders(A.id, at(13));
    const pending = await pendingFor(id);
    expect(pending.map((r) => r.ruleKey)).toEqual([`assessment:${id}:${TEST_DAY}:2`]);
    expect((await prisma.reminder.findUnique({ where: { id: five.id } }))!.status).toBe("DISMISSED");
  });
});

describe("the student's switch", () => {
  it("makes no assessment reminders while it is off, and starts once it is on", async () => {
    const s = await student("off", { assessmentEnabled: false });
    const id = await addAssessment(s, {});
    await generateReminders(s.id, at(10));
    expect(await remindersFor(id)).toHaveLength(0);

    const res = await request(app).put("/api/reminders/settings").set(s.headers).send({ assessmentEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.assessmentEnabled).toBe(true);
    await generateReminders(s.id, at(10, "10:00"));
    expect(await remindersFor(id)).toHaveLength(1);
  });

  it("removes pending ones when it is switched off", async () => {
    const s = await student("switchoff");
    const id = await addAssessment(s, {});
    await generateReminders(s.id, at(10));
    await request(app).put("/api/reminders/settings").set(s.headers).send({ assessmentEnabled: false }).expect(200);
    await generateReminders(s.id, at(11));
    expect(await remindersFor(id)).toHaveLength(0);
  });

  it("rejects a non-boolean setting", async () => {
    const res = await request(app).put("/api/reminders/settings").set(A.headers).send({ assessmentEnabled: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("ownership and the reminders API", () => {
  it("only reminds a student about their own assessments", async () => {
    const other = await student("other");
    const theirs = await addAssessment(other, { name: "Theirs" });
    await generateReminders(A.id, at(10));
    expect(await remindersFor(theirs)).toHaveLength(0);
    await generateReminders(other.id, at(10));
    const [reminder] = await remindersFor(theirs);
    expect(reminder.userId).toBe(other.id);
  });

  it("lists the reminder with its module, and counts it as due", async () => {
    const s = await student("api");
    // Dated relative to today, since the API applies the rules at the real time.
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const id = await addAssessment(s, { name: "Soon", date: day, dateKind: "DUE" });
    await generateReminders(s.id, new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`));

    const list = await request(app).get("/api/reminders").set(s.headers);
    expect(list.status).toBe(200);
    const reminder = list.body.find((r: { assessment: { id: string } | null }) => r.assessment?.id === id);
    expect(reminder).toMatchObject({
      source: "ASSESSMENT",
      entry: null,
      assessment: { id, moduleId: s.moduleId, moduleCode: s.code, name: "Soon", date: day, dateKind: "DUE" },
    });
    expect(reminder.title).toMatch(/^Due /);

    const count = await request(app).get("/api/reminders/count").set(s.headers);
    expect(count.body.due).toBeGreaterThanOrEqual(1);
  });

  it("returns remind on assessments, defaulting to on", async () => {
    const id = await addAssessment(A, { name: "Default" });
    const module = (await request(app).get(`/api/grades/modules/${A.moduleId}`).set(A.headers)).body;
    expect(module.assessments.find((a: { id: string }) => a.id === id).remind).toBe(true);
  });
});
