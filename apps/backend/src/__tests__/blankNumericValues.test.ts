import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── BUG-012 regression suite ─────────────────────────────────────────────
// A NUMBER field the user never filled in was submitted as "", passed
// validation (empty values skip the type check), and was stored as a row
// holding an empty string. Every later sum/avg/min/max on that field then
// hit (mv.value)::numeric and failed with 22P02, taking the statistics page
// down and printing the raw Prisma error to the user.
//
// Two halves to the fix: entries no longer write empty values, and the
// aggregation queries exclude rows that do not look numeric, so data written
// before the fix cannot keep breaking things.

const USER_ID = crypto.randomUUID();
const ts = Date.now();
let H: Record<string, string>;
let projectId: string;
let hoursFieldId: string;
let noteFieldId: string;

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `blank_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: "Blank Value User",
      isEmailVerified: true,
    },
  });
  H = { Authorization: `Bearer ${generateToken(USER_ID)}` };

  const project = await request(app).post("/api/projects").set(H).send({ name: `__blank_${ts}` });
  projectId = project.body.id;

  const hours = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "Hours", type: "NUMBER", required: false });
  hoursFieldId = hours.body.id;

  const note = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "Note", type: "TEXT", required: false });
  noteFieldId = note.body.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
});

describe("BUG-012: a blank numeric field is not stored", () => {
  it("writes no row for a field the user left alone", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [hoursFieldId]: "", [noteFieldId]: "skipped hours" } });

    expect(res.status).toBe(201);

    const stored = await prisma.entryValue.findMany({
      where: { entryId: res.body.id },
      select: { fieldId: true, value: true },
    });
    expect(stored.map((v) => v.fieldId)).not.toContain(hoursFieldId);
    expect(stored.find((v) => v.fieldId === noteFieldId)?.value).toBe("skipped hours");
  });

  it("removes the row when an existing value is cleared", async () => {
    const created = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 5, values: { [hoursFieldId]: 7 } });
    expect(created.status).toBe(201);

    const before = await prisma.entryValue.findFirst({
      where: { entryId: created.body.id, fieldId: hoursFieldId },
    });
    expect(before?.value).toBe("7");

    const cleared = await request(app)
      .put(`/api/entries/${created.body.id}`)
      .set(H)
      .send({ values: { [hoursFieldId]: "" } });
    expect(cleared.status).toBe(200);

    const after = await prisma.entryValue.findFirst({
      where: { entryId: created.body.id, fieldId: hoursFieldId },
    });
    expect(after).toBeNull();
  });

  it("still refuses to leave a required field empty", async () => {
    // Runs on its own project: a required field left behind on the shared
    // one would reject every later entry that omits it, silently starving
    // the aggregation cases below of the rows they intend to create.
    const scratch = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__blank_required_${ts}` });
    const required = await request(app)
      .post(`/api/projects/${scratch.body.id}/entry-fields`)
      .set(H)
      .send({ name: "Summary", type: "TEXT", required: true });

    const res = await request(app)
      .post(`/api/projects/${scratch.body.id}/entries`)
      .set(H)
      .send({ durationMinutes: 1, values: { [required.body.id]: "" } });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Summary");
  });
});

describe("BUG-012: aggregations survive a non-numeric row", () => {
  it("aggregates a field that some entries never filled in", async () => {
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 20, values: { [hoursFieldId]: 4 } });

    for (const operation of ["sum", "avg", "min", "max", "count"]) {
      const res = await request(app)
        .post(`/api/projects/${projectId}/stats/group`)
        .set(H)
        .send({ metricFieldId: hoursFieldId, operation });

      expect(res.status, `${operation} should not fail`).toBe(200);
    }
  });

  it("ignores an empty-string row written before this fix", async () => {
    // Exactly what the old write path produced, inserted directly because
    // the API will no longer create one.
    const legacy = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 15, values: {} });

    await prisma.entryValue.create({
      data: { entryId: legacy.body.id, fieldId: hoursFieldId, value: "" },
    });

    const sum = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "sum" });

    expect(sum.status).toBe(200);
    expect(sum.body.groups[0].value).toBe(4); // the "7" was cleared; the "4" remains, and nothing from the empty row

    const counted = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "count" });

    expect(counted.status).toBe(200);
    // count does not cast, but an empty row still means the field was never
    // filled in, so it must not be counted as though it were.
    expect(counted.body.groups[0].value).toBe(1);

    const min = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "min" });

    expect(min.status).toBe(200);
    // The empty row must not drag the minimum to zero.
    expect(min.body.groups[0].value).toBeGreaterThan(0);
  });

  it("ignores a malformed date row when plotting over time", async () => {
    const dateField = await request(app)
      .post(`/api/projects/${projectId}/entry-fields`)
      .set(H)
      .send({ name: "Worked on", type: "DATE", required: false });

    const entry = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 8, values: { [dateField.body.id]: "2026-05-04" } });
    expect(entry.status).toBe(201);

    const broken = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 9, values: {} });
    await prisma.entryValue.create({
      data: { entryId: broken.body.id, fieldId: dateField.body.id, value: "" },
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: dateField.body.id, bucket: "day" });

    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(1);
  });
});
