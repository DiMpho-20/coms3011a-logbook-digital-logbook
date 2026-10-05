import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";
import { daysBetween, entryLabel, generateReminders, localClock, timeToMinutes } from "../utils/reminders.js";

// US28 — Generate automatic reminders.

const ts = Date.now();
const USER_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
let H: Record<string, string>;
let OTHER: Record<string, string>;
let projectId: string;
let textFieldId: string;

/** The UTC calendar day `offset` days from today, as the API takes a due date. */
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function createUser(id: string, label: string) {
  await prisma.user.create({
    data: {
      id,
      email: `reminders_${label}_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: `Reminders ${label}`,
      isEmailVerified: true,
    },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

async function createEntry(text: string, dueDate?: string, headers = H, project = projectId, field = textFieldId) {
  const res = await request(app)
    .post(`/api/projects/${project}/entries`)
    .set(headers)
    .send({ durationMinutes: 30, values: { [field]: text }, ...(dueDate ? { dueDate } : {}) });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function pending(headers = H) {
  const res = await request(app).get("/api/reminders").set(headers);
  expect(res.status).toBe(200);
  return res.body as any[];
}

const forEntry = (reminders: any[], entryId: string) => reminders.filter((r) => r.entry?.id === entryId);

beforeAll(async () => {
  H = await createUser(USER_ID, "main");
  OTHER = await createUser(OTHER_ID, "other");

  const projectRes = await request(app).post("/api/projects").set(H).send({ name: `__reminders_${ts}` });
  projectId = projectRes.body.id;
  const fieldRes = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "Task", type: "TEXT" });
  textFieldId = fieldRes.body.id;

  // Count calendar days in UTC, the same zone day() uses.
  await request(app).put("/api/reminders/settings").set(H).send({ timeZone: "UTC" });
});

afterAll(async () => {
  // Cascades to projects, entries, reminders and reminder settings.
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_ID] } } });
});

// ── Pure helpers ──────────────────────────────────────────────────────────

describe("reminder helpers", () => {
  it("reads the calendar day and time in the student's zone", () => {
    const instant = new Date("2026-09-26T23:30:00Z");
    expect(localClock(instant, "UTC")).toEqual({ date: "2026-09-26", minutes: 23 * 60 + 30 });
    // Johannesburg is UTC+2, so it is already the next morning there.
    expect(localClock(instant, "Africa/Johannesburg")).toEqual({ date: "2026-09-27", minutes: 90 });
  });

  it("falls back to UTC for an unknown zone", () => {
    const instant = new Date("2026-09-26T10:00:00Z");
    expect(localClock(instant, "Not/AZone")).toEqual(localClock(instant, "UTC"));
  });

  it("counts whole calendar days between dates", () => {
    expect(daysBetween("2026-09-26", "2026-09-27")).toBe(1);
    expect(daysBetween("2026-09-26", "2026-09-26")).toBe(0);
    expect(daysBetween("2026-09-26", "2026-09-20")).toBe(-6);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("converts HH:MM to minutes", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("18:30")).toBe(1110);
  });

  it("labels an entry by its first text value, else by its project", () => {
    expect(entryLabel({ values: [{ value: "  " }, { value: "Lab report" }], project: { name: "P" } })).toBe("Lab report");
    expect(entryLabel({ values: [], project: { name: "Thesis" } })).toBe("Entry in Thesis");
    expect(entryLabel({ values: [{ value: "x".repeat(200) }], project: { name: "P" } })).toHaveLength(120);
  });
});

// ── AT1: an entry's reminder condition is reached → a reminder is generated

describe("AT1 — reminders generated from entries", () => {
  let dueTomorrow: string;
  let dueLater: string;
  let overdue: string;
  let undated: string;

  beforeAll(async () => {
    dueTomorrow = await createEntry("Submit lab report", day(1));
    dueLater = await createEntry("Write thesis chapter", day(10));
    overdue = await createEntry("Return library book", day(-2));
    undated = await createEntry("Read paper");
  });

  it("generates a due-soon reminder once an entry's due date is within the lead time", async () => {
    const [reminder] = forEntry(await pending(), dueTomorrow);
    expect(reminder).toMatchObject({
      source: "DUE_SOON",
      status: "PENDING",
      title: "Due soon: Submit lab report",
      entry: { id: dueTomorrow, projectId, projectName: `__reminders_${ts}`, label: "Submit lab report", status: "OPEN" },
    });
    expect(reminder.entry.dueDate.slice(0, 10)).toBe(day(1));
  });

  it("generates an overdue reminder once the due date has passed", async () => {
    const reminders = forEntry(await pending(), overdue);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ source: "OVERDUE", title: "Overdue: Return library book" });
  });

  it("does not generate a reminder before the condition is reached", async () => {
    const reminders = await pending();
    expect(forEntry(reminders, dueLater)).toHaveLength(0);
    expect(forEntry(reminders, undated)).toHaveLength(0);
  });

  it("never duplicates a reminder however often the rules run", async () => {
    await Promise.all([pending(), pending(), request(app).get("/api/reminders/count").set(H)]);
    expect(forEntry(await pending(), dueTomorrow)).toHaveLength(1);
    expect(await prisma.reminder.count({ where: { entryId: dueTomorrow } })).toBe(1);
  });

  it("generates a reminder when an edit brings the entry inside the lead time", async () => {
    await request(app).put(`/api/entries/${dueLater}`).set(H).send({ dueDate: day(0) }).expect(200);
    const [reminder] = forEntry(await pending(), dueLater);
    expect(reminder.source).toBe("DUE_SOON");
  });

  it("drops a pending reminder whose due date moves out of range", async () => {
    await request(app).put(`/api/entries/${dueLater}`).set(H).send({ dueDate: day(20) }).expect(200);
    expect(forEntry(await pending(), dueLater)).toHaveLength(0);
  });

  it("marks the reminder completed when its entry is marked done", async () => {
    await request(app).patch(`/api/entries/${overdue}/status`).set(H).send({ status: "DONE" }).expect(200);
    expect(forEntry(await pending(), overdue)).toHaveLength(0);

    const done = (await request(app).get("/api/reminders?status=completed").set(H)).body;
    const [reminder] = forEntry(done, overdue);
    expect(reminder.status).toBe("COMPLETED");
    expect(reminder.completedAt).not.toBeNull();
  });

  it("does not remind about archived entries", async () => {
    const archived = await createEntry("Old task", day(0));
    expect(forEntry(await pending(), archived)).toHaveLength(1);
    await request(app).patch(`/api/entries/${archived}/archive`).set(H).send({ archived: true }).expect(200);
    expect(forEntry(await pending(), archived)).toHaveLength(0);
  });

  it("uses the configured lead time", async () => {
    const inFiveDays = await createEntry("Prepare presentation", day(5));
    expect(forEntry(await pending(), inFiveDays)).toHaveLength(0);

    await request(app).put("/api/reminders/settings").set(H).send({ dueSoonDays: 5 }).expect(200);
    expect(forEntry(await pending(), inFiveDays)).toHaveLength(1);

    await request(app).put("/api/reminders/settings").set(H).send({ dueSoonDays: 1 }).expect(200);
    expect(forEntry(await pending(), inFiveDays)).toHaveLength(0);
  });

  it("stops generating a rule's reminders once it is switched off", async () => {
    const soon = await createEntry("Switch-off check", day(0));
    await request(app).put("/api/reminders/settings").set(H).send({ dueSoonEnabled: false }).expect(200);
    expect(forEntry(await pending(), soon)).toHaveLength(0);
    await request(app).put("/api/reminders/settings").set(H).send({ dueSoonEnabled: true }).expect(200);
    expect(forEntry(await pending(), soon)).toHaveLength(1);
  });

  it("reminds about an open entry left without progress", async () => {
    const idle = await createEntry("Idle experiment");
    await prisma.$executeRaw`UPDATE logbook_entries SET updated_at = NOW() - INTERVAL '10 days' WHERE id = ${idle}::uuid`;
    expect(forEntry(await pending(), idle)).toHaveLength(0);

    await request(app).put("/api/reminders/settings").set(H).send({ staleEnabled: true, staleDays: 7 }).expect(200);
    const [reminder] = forEntry(await pending(), idle);
    expect(reminder).toMatchObject({ source: "STALE", title: "No progress in 7 days: Idle experiment" });

    // Working on it again clears the condition.
    await request(app).put(`/api/entries/${idle}`).set(H).send({ durationMinutes: 45 }).expect(200);
    expect(forEntry(await pending(), idle)).toHaveLength(0);
    await request(app).put("/api/reminders/settings").set(H).send({ staleEnabled: false }).expect(200);
  });

  it("only uses the caller's own entries", async () => {
    const otherProject = (await request(app).post("/api/projects").set(OTHER).send({ name: `__reminders_other_${ts}` })).body.id;
    const otherField = (await request(app)
      .post(`/api/projects/${otherProject}/entry-fields`)
      .set(OTHER)
      .send({ name: "Task", type: "TEXT" })).body.id;
    const theirs = await createEntry("Someone else's deadline", day(0), OTHER, otherProject, otherField);

    expect(forEntry(await pending(), theirs)).toHaveLength(0);
    expect(forEntry(await pending(OTHER), theirs)).toHaveLength(1);
  });
});

// ── Daily log rule ────────────────────────────────────────────────────────

describe("daily log reminder", () => {
  it("reminds a student who has logged nothing today, and completes once they do", async () => {
    // A fresh user: nothing logged yet.
    const id = crypto.randomUUID();
    const headers = await createUser(id, "daily");
    try {
      await request(app).put("/api/reminders/settings").set(headers)
        .send({ dailyLogEnabled: true, dailyLogTime: "00:00", timeZone: "UTC" }).expect(200);
      const [reminder] = await pending(headers);
      expect(reminder).toMatchObject({ source: "DAILY_LOG", title: "Log today's work", entry: null });

      const project = (await request(app).post("/api/projects").set(headers).send({ name: `__daily_${ts}` })).body.id;
      const field = (await request(app).post(`/api/projects/${project}/entry-fields`).set(headers)
        .send({ name: "Task", type: "TEXT" })).body.id;
      await createEntry("Today's work", undefined, headers, project, field);

      expect(await pending(headers)).toHaveLength(0);
      const completed = (await request(app).get("/api/reminders?status=completed").set(headers)).body;
      expect(completed.map((r: any) => r.source)).toEqual(["DAILY_LOG"]);
    } finally {
      await prisma.user.delete({ where: { id } });
    }
  });

  it("waits until the configured time", async () => {
    const id = crypto.randomUUID();
    await createUser(id, "daily_late");
    try {
      await prisma.reminderSettings.create({
        data: { userId: id, dailyLogEnabled: true, dailyLogTime: "18:00", timeZone: "Africa/Johannesburg" },
      });
      // 15:00 UTC is 17:00 in Johannesburg: not yet time.
      await generateReminders(id, new Date("2026-09-26T15:00:00Z"));
      expect(await prisma.reminder.count({ where: { userId: id } })).toBe(0);

      // 16:30 UTC is 18:30 there: the reminder appears, keyed to that local day.
      await generateReminders(id, new Date("2026-09-26T16:30:00Z"));
      const reminders = await prisma.reminder.findMany({ where: { userId: id } });
      expect(reminders.map((r) => r.ruleKey)).toEqual(["daily-log:2026-09-26"]);
    } finally {
      await prisma.user.delete({ where: { id } });
    }
  });
});

// ── AT2: a configured reminder's time is reached → it can be seen ─────────

describe("AT2 — manual reminders at a set time", () => {
  let futureId: string;
  let pastId: string;

  beforeAll(async () => {
    futureId = (await request(app).post("/api/reminders").set(H)
      .send({ title: "Book lab slot", remindAt: new Date(Date.now() + 3_600_000).toISOString() })).body.id;
    pastId = (await request(app).post("/api/reminders").set(H)
      .send({ title: "Email supervisor", note: "About the ethics form", remindAt: new Date(Date.now() - 60_000).toISOString() })).body.id;
  });

  it("creates a reminder with a time", async () => {
    const res = await request(app).post("/api/reminders").set(H)
      .send({ title: "  Check results  ", remindAt: "2030-01-01T09:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Check results",
      source: "MANUAL",
      status: "PENDING",
      remindAt: "2030-01-01T09:00:00.000Z",
      entry: null,
    });
  });

  it("shows a reminder once its time is reached", async () => {
    const due = (await request(app).get("/api/reminders?due=true").set(H)).body;
    const ids = due.map((r: any) => r.id);
    expect(ids).toContain(pastId);
    expect(ids).not.toContain(futureId);
    expect(due.find((r: any) => r.id === pastId).note).toBe("About the ethics form");
  });

  it("still lists a reminder that is not yet due among the pending ones", async () => {
    expect((await pending()).map((r) => r.id)).toContain(futureId);
  });

  it("counts reminders that are due now", async () => {
    const res = await request(app).get("/api/reminders/count").set(H);
    expect(res.status).toBe(200);
    const due = (await request(app).get("/api/reminders?due=true").set(H)).body;
    expect(res.body.due).toBe(due.length);
  });

  it("shows a snoozed reminder again only once its new time comes", async () => {
    await request(app).patch(`/api/reminders/${pastId}`).set(H)
      .send({ remindAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(200);
    const due = (await request(app).get("/api/reminders?due=true").set(H)).body;
    expect(due.map((r: any) => r.id)).not.toContain(pastId);
  });

  it("can link a reminder to one of the caller's entries", async () => {
    const entryId = await createEntry("Linked task");
    const res = await request(app).post("/api/reminders").set(H)
      .send({ title: "Follow up", remindAt: new Date().toISOString(), entryId });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ id: entryId, label: "Linked task" });
  });

  it("rejects an invalid reminder", async () => {
    const noTitle = await request(app).post("/api/reminders").set(H).send({ title: " ", remindAt: new Date().toISOString() });
    expect(noTitle.status).toBe(400);
    const badDate = await request(app).post("/api/reminders").set(H).send({ title: "x", remindAt: "not a date" });
    expect(badDate.status).toBe(400);
    const noDate = await request(app).post("/api/reminders").set(H).send({ title: "x" });
    expect(noDate.status).toBe(400);
  });

  it("will not link a reminder to someone else's entry", async () => {
    const theirs = await prisma.logbookEntry.findFirst({ where: { project: { userId: OTHER_ID } } });
    const res = await request(app).post("/api/reminders").set(H)
      .send({ title: "Snoop", remindAt: new Date().toISOString(), entryId: theirs!.id });
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/reminders")).status).toBe(401);
    expect((await request(app).post("/api/reminders").send({ title: "x", remindAt: new Date().toISOString() })).status).toBe(401);
  });
});

// ── AT3: several reminders → the relevant ones are shown ──────────────────

describe("AT3 — viewing reminders", () => {
  it("lists pending reminders in the order they fall due", async () => {
    const times = (await pending()).map((r) => Date.parse(r.remindAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("keeps completed and dismissed reminders out of the pending list", async () => {
    const [a, b] = await Promise.all(["Done one", "Dismissed one"].map(async (title) =>
      (await request(app).post("/api/reminders").set(H).send({ title, remindAt: new Date().toISOString() })).body.id));
    await request(app).patch(`/api/reminders/${a}`).set(H).send({ status: "COMPLETED" }).expect(200);
    await request(app).patch(`/api/reminders/${b}`).set(H).send({ status: "DISMISSED" }).expect(200);

    const pendingIds = (await pending()).map((r) => r.id);
    expect(pendingIds).not.toContain(a);
    expect(pendingIds).not.toContain(b);

    const done = (await request(app).get("/api/reminders?status=done").set(H)).body.map((r: any) => r.id);
    expect(done).toEqual(expect.arrayContaining([a, b]));
    const dismissed = (await request(app).get("/api/reminders?status=dismissed").set(H)).body.map((r: any) => r.id);
    expect(dismissed).toContain(b);
    expect(dismissed).not.toContain(a);
  });

  it("never shows another student's reminders", async () => {
    const mine = (await request(app).get("/api/reminders?status=all").set(H)).body;
    const theirs = (await request(app).get("/api/reminders?status=all").set(OTHER)).body;
    const mineIds = new Set(mine.map((r: any) => r.id));
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.some((r: any) => mineIds.has(r.id))).toBe(false);
  });

  it("rejects an unknown status filter", async () => {
    expect((await request(app).get("/api/reminders?status=bogus").set(H)).status).toBe(400);
  });
});

// ── AT4: work done → the reminder can be completed or dismissed ───────────

describe("AT4 — completing and dismissing", () => {
  let id: string;

  beforeAll(async () => {
    id = (await request(app).post("/api/reminders").set(H)
      .send({ title: "Hand in form", remindAt: new Date().toISOString() })).body.id;
  });

  it("marks a reminder completed", async () => {
    const res = await request(app).patch(`/api/reminders/${id}`).set(H).send({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.completedAt).not.toBeNull();
    expect(res.body.dismissedAt).toBeNull();
  });

  it("reopens a completed reminder", async () => {
    const res = await request(app).patch(`/api/reminders/${id}`).set(H).send({ status: "PENDING" });
    expect(res.body).toMatchObject({ status: "PENDING", completedAt: null, dismissedAt: null });
  });

  it("dismisses a reminder", async () => {
    const res = await request(app).patch(`/api/reminders/${id}`).set(H).send({ status: "DISMISSED" });
    expect(res.body.status).toBe("DISMISSED");
    expect(res.body.dismissedAt).not.toBeNull();
    expect(res.body.completedAt).toBeNull();
  });

  it("keeps a dismissed generated reminder dismissed while its condition still holds", async () => {
    const entryId = await createEntry("Persistent deadline", day(0));
    const [reminder] = forEntry(await pending(), entryId);
    await request(app).patch(`/api/reminders/${reminder.id}`).set(H).send({ status: "DISMISSED" }).expect(200);

    expect(forEntry(await pending(), entryId)).toHaveLength(0);
    expect(await prisma.reminder.count({ where: { entryId } })).toBe(1);
  });

  it("rejects an invalid status or an empty update", async () => {
    expect((await request(app).patch(`/api/reminders/${id}`).set(H).send({ status: "SNOOZED" })).status).toBe(400);
    expect((await request(app).patch(`/api/reminders/${id}`).set(H).send({})).status).toBe(400);
  });

  it("returns 404 for someone else's reminder or a malformed id", async () => {
    expect((await request(app).patch(`/api/reminders/${id}`).set(OTHER).send({ status: "COMPLETED" })).status).toBe(404);
    expect((await request(app).patch("/api/reminders/not-a-uuid").set(H).send({ status: "COMPLETED" })).status).toBe(404);
    expect((await request(app).delete(`/api/reminders/${id}`).set(OTHER)).status).toBe(404);
  });

  it("deletes a manual reminder but only dismisses a generated one", async () => {
    expect((await request(app).delete(`/api/reminders/${id}`).set(H)).status).toBe(204);
    expect(await prisma.reminder.findUnique({ where: { id } })).toBeNull();

    const generated = await prisma.reminder.findFirst({ where: { userId: USER_ID, source: { not: "MANUAL" } } });
    expect((await request(app).delete(`/api/reminders/${generated!.id}`).set(H)).status).toBe(400);
  });
});

// ── Rule settings ─────────────────────────────────────────────────────────

describe("reminder settings", () => {
  it("returns the defaults for a student who has not configured any", async () => {
    const res = await request(app).get("/api/reminders/settings").set(OTHER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      dueSoonEnabled: true,
      dueSoonDays: 1,
      overdueEnabled: true,
      staleEnabled: false,
      staleDays: 7,
      dailyLogEnabled: false,
      dailyLogTime: "18:00",
      timeZone: "UTC",
      assessmentEnabled: true,
    });
  });

  it("updates only the rules sent", async () => {
    const res = await request(app).put("/api/reminders/settings").set(H)
      .send({ dueSoonDays: 3, timeZone: "Africa/Johannesburg" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dueSoonDays: 3, timeZone: "Africa/Johannesburg", overdueEnabled: true });
  });

  it("rejects invalid rules", async () => {
    for (const body of [{ dueSoonDays: -1 }, { dueSoonDays: 31 }, { staleDays: 0 }, { dailyLogTime: "25:00" }, { timeZone: "Mars/Olympus" }]) {
      expect((await request(app).put("/api/reminders/settings").set(H).send(body)).status).toBe(400);
    }
  });
});
