import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

const USER_ID = crypto.randomUUID();
const ts = Date.now();
let H: Record<string, string>;

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `entryval_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: "Entry Validation Test User",
      isEmailVerified: true,
    },
  });
  H = { Authorization: `Bearer ${generateToken(USER_ID)}` };
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
});

async function createProject(name: string) {
  const res = await request(app).post("/api/projects").set(H).send({ name });
  return res.body.id as string;
}

async function createField(projectId: string, body: Record<string, unknown>) {
  const res = await request(app).post(`/api/projects/${projectId}/entry-fields`).set(H).send(body);
  return res.body.id as string;
}

describe("Server-side entry value validation", () => {
  it("rejects a NUMBER field given a non-numeric value", async () => {
    const projectId = await createProject(`__val_number_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [hoursId]: "not a number" } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Hours");
  });

  it("accepts a NUMBER field given a numeric string, matching how the app stores values", async () => {
    const projectId = await createProject(`__val_number_str_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [hoursId]: "45" } });

    expect(res.status).toBe(201);
    expect(res.body.values[hoursId]).toBe(45);
  });

  it("rejects a BOOLEAN field given a non-boolean value", async () => {
    const projectId = await createProject(`__val_bool_${ts}`);
    const doneId = await createField(projectId, { name: "Done", type: "BOOLEAN" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [doneId]: "yes" } });

    expect(res.status).toBe(400);
  });

  it("rejects creating an entry that leaves a required field empty", async () => {
    const projectId = await createProject(`__val_required_${ts}`);
    await createField(projectId, { name: "Summary", type: "TEXT", required: true });

    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Summary");
  });

  it("rejects an update that clears a required field", async () => {
    const projectId = await createProject(`__val_required_update_${ts}`);
    const summaryId = await createField(projectId, { name: "Summary", type: "TEXT", required: true });

    const createRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [summaryId]: "Filled in" } });
    const entryId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(H)
      .send({ values: { [summaryId]: "" } });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.error).toContain("Summary");
  });

  it("accepts a duration of 0 for work that hasn't started yet", async () => {
    const projectId = await createProject(`__val_zero_duration_${ts}`);
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 0, values: {} });

    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(0);
  });
});

describe("Format migration: adding a field backfills existing entries", () => {
  it("leaves an existing entry without a newly added NUMBER field, rather than fabricating a value", async () => {
    const projectId = await createProject(`__migrate_number_${ts}`);

    const entryRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: {} });
    const entryId = entryRes.body.id;

    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    const getRes = await request(app).get(`/api/projects/${projectId}/entries`).set(H);
    const entry = getRes.body.find((e: any) => e.id === entryId);
    // No fabricated "0" — the field genuinely doesn't exist for this entry
    // until someone edits it in.
    expect(entry.values[hoursId]).toBeUndefined();
  }, 30_000);

  it("does not let a pre-existing entry dilute the average or corrupt the min of a newly added field", async () => {
    const projectId = await createProject(`__migrate_avg_${ts}`);

    // This entry predates "Hours" and never recorded any.
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: {} });

    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    // Only entries logged after the field existed have real values.
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: { [hoursId]: 10 } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: { [hoursId]: 20 } });

    const avgRes = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "avg" });
    // A fabricated 0 for the pre-existing entry would make this (0+10+20)/3 = 10.
    expect(avgRes.body.groups[0].value).toBe(15);

    const minRes = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "min" });
    // A fabricated 0 would report a minimum nobody actually logged.
    expect(minRes.body.groups[0].value).toBe(10);

    const countRes = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "count" });
    expect(countRes.body.groups[0].value).toBe(2);
  }, 30_000);

  it("computes a value from existing numbers for a newly added COMPUTED field", async () => {
    const projectId = await createProject(`__migrate_computed_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    const entryRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: { [hoursId]: 4 } });
    const entryId = entryRes.body.id;

    const doubledId = await createField(projectId, {
      name: "Doubled",
      type: "COMPUTED",
      formula: `{${hoursId}} * 2`,
    });

    const getRes = await request(app).get(`/api/projects/${projectId}/entries`).set(H);
    const entry = getRes.body.find((e: any) => e.id === entryId);
    expect(entry.values[doubledId]).toBe(8);
  }, 30_000);
});
