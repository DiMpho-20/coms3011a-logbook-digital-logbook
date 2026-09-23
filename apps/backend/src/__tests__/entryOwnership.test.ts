import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── BUG-011 regression suite ─────────────────────────────────────────────
// requireAuth establishes that a caller holds a valid token, not that the
// resource in the path is theirs. Every entry and statistics route used to
// resolve records by id alone, so any signed-in account could read, edit and
// delete another's entries. Each test below is user B reaching for something
// of user A's.

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();

let HA: Record<string, string>;
let HB: Record<string, string>;
let projectId: string;
let entryId: string;
let numberFieldId: string;
let dateFieldId: string;

async function makeUser(id: string, email: string, name: string) {
  await prisma.user.create({
    data: { id, email, passwordHash: await hashPassword("Password123"), fullName: name, isEmailVerified: true },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

beforeAll(async () => {
  HA = await makeUser(USER_A, `own_a_${ts}@example.com`, "Owner A");
  HB = await makeUser(USER_B, `own_b_${ts}@example.com`, "Intruder B");

  const project = await request(app).post("/api/projects").set(HA).send({ name: `__own_proj_${ts}` });
  projectId = project.body.id;

  const numberField = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(HA)
    .send({ name: "Hours", type: "NUMBER", required: false });
  numberFieldId = numberField.body.id;

  const dateField = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(HA)
    .send({ name: "Worked on", type: "DATE", required: false });
  dateFieldId = dateField.body.id;

  const entry = await request(app)
    .post(`/api/projects/${projectId}/entries`)
    .set(HA)
    .send({ durationMinutes: 45, values: { [numberFieldId]: 3, [dateFieldId]: "2026-09-01" } });
  entryId = entry.body.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_A } }).catch(() => {});
  await prisma.user.delete({ where: { id: USER_B } }).catch(() => {});
});

describe("BUG-011: another user's entries are unreachable", () => {
  it("does not list them", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/entries`).set(HB);
    expect(res.status).toBe(404);
  });

  it("does not let one be created in their project", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(HB)
      .send({ durationMinutes: 10, values: {} });
    expect(res.status).toBe(404);
  });

  it("does not let one be edited", async () => {
    const res = await request(app).put(`/api/entries/${entryId}`).set(HB).send({ durationMinutes: 999 });
    expect(res.status).toBe(404);

    const untouched = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(untouched?.durationMinutes).toBe(45);
  });

  it("does not let one be marked done", async () => {
    const res = await request(app).patch(`/api/entries/${entryId}/status`).set(HB).send({ status: "DONE" });
    expect(res.status).toBe(404);

    const untouched = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(untouched?.status).toBe("OPEN");
  });

  it("does not let one be deleted", async () => {
    const res = await request(app).delete(`/api/entries/${entryId}`).set(HB);
    expect(res.status).toBe(404);

    const survivor = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(survivor).not.toBeNull();
  });
});

describe("BUG-011: another user's statistics are unreachable", () => {
  it("does not aggregate their fields", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(HB)
      .send({ metricFieldId: numberFieldId, operation: "sum" });
    expect(res.status).toBe(404);
  });

  it("does not plot their entries over time", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(HB)
      .send({ dateFieldId, bucket: "day" });
    expect(res.status).toBe(404);
  });
});

describe("BUG-011: the owner is unaffected", () => {
  it("still lists, aggregates and plots their own entries", async () => {
    const list = await request(app).get(`/api/projects/${projectId}/entries`).set(HA);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const group = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(HA)
      .send({ metricFieldId: numberFieldId, operation: "sum" });
    expect(group.status).toBe(200);
    expect(group.body.groups[0].value).toBe(3);

    const timeline = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(HA)
      .send({ dateFieldId, bucket: "day" });
    expect(timeline.status).toBe(200);
    expect(timeline.body.points).toHaveLength(1);
  });

  it("still edits, completes and deletes their own entry", async () => {
    const edit = await request(app).put(`/api/entries/${entryId}`).set(HA).send({ durationMinutes: 50 });
    expect(edit.status).toBe(200);
    expect(edit.body.durationMinutes).toBe(50);

    const done = await request(app).patch(`/api/entries/${entryId}/status`).set(HA).send({ status: "DONE" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("DONE");

    const removed = await request(app).delete(`/api/entries/${entryId}`).set(HA);
    expect(removed.status).toBe(200);
  });
});
