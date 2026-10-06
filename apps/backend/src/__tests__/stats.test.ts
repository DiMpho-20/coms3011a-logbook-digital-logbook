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
      email: `stats_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: "Stats Test User",
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

describe("Stats: aggregating a COMPUTED field", () => {
  it("sums a COMPUTED field across entries, which used to be rejected outright", async () => {
    const projectId = await createProject(`__stats_computed_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });
    const costId = await createField(projectId, {
      name: "Cost",
      type: "COMPUTED",
      formula: `{${hoursId}} * 10`,
    });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [hoursId]: 2 } }); // Cost = 20
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [hoursId]: 3 } }); // Cost = 30

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: costId, operation: "sum" });

    expect(res.status).toBe(200);
    expect(res.body.groups[0].value).toBe(50);
  }, 30_000);

  it("still rejects a genuinely non-numeric field type for sum/avg", async () => {
    const projectId = await createProject(`__stats_reject_${ts}`);
    const notesId = await createField(projectId, { name: "Notes", type: "TEXT" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: notesId, operation: "sum" });

    expect(res.status).toBe(400);
  });
});

describe("Stats: counting a non-numeric field", () => {
  it("counts how many entries have a CHECKLIST field filled in", async () => {
    const projectId = await createProject(`__stats_count_checklist_${ts}`);
    const stepsId = await createField(projectId, { name: "Steps", type: "CHECKLIST" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [stepsId]: [{ label: "Draft", checked: false }] } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: {} });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: stepsId, operation: "count" });

    expect(res.status).toBe(200);
    expect(res.body.groups[0].value).toBe(1);
  }, 30_000);

  it("groups a BOOLEAN count by a TAGS field", async () => {
    const projectId = await createProject(`__stats_count_group_${ts}`);
    const billableId = await createField(projectId, { name: "Billable", type: "BOOLEAN" });
    const clientId = await createField(projectId, { name: "Client", type: "TEXT" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [billableId]: true, [clientId]: "Acme" } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [billableId]: true, [clientId]: "Acme" } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [billableId]: false, [clientId]: "Globex" } });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: billableId, operation: "count", groupByFieldId: clientId });

    expect(res.status).toBe(200);
    const byClient = Object.fromEntries(res.body.groups.map((g: any) => [g.key, g.value]));
    expect(byClient["Acme"]).toBe(2);
    expect(byClient["Globex"]).toBe(1);
  }, 30_000);
});

describe("Stats update correctly after entries change", () => {
  it("reflects an entry edit's new duration in the project time summary", async () => {
    const projectId = await createProject(`__stats_edit_${ts}`);
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: {} });
    const entryId = createRes.body.id;

    const before = await request(app).get(`/api/projects/${projectId}/time-summary`).set(H);
    expect(before.body.totalMinutes).toBe(30);

    await request(app).put(`/api/entries/${entryId}`).set(H).send({ durationMinutes: 90 });

    const after = await request(app).get(`/api/projects/${projectId}/time-summary`).set(H);
    expect(after.body.totalMinutes).toBe(90);
  });

  it("excludes a deleted entry from the time summary and group stats", async () => {
    const projectId = await createProject(`__stats_delete_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: { [hoursId]: 5 } });
    const deleteRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: { [hoursId]: 100 } });

    await request(app).delete(`/api/entries/${deleteRes.body.id}`).set(H);

    const summary = await request(app).get(`/api/projects/${projectId}/time-summary`).set(H);
    expect(summary.body.totalMinutes).toBe(30);
    expect(summary.body.entryCount).toBe(1);

    const stats = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "sum" });
    expect(stats.body.groups[0].value).toBe(5);
  }, 30_000);

  it("picks up a value added to an entry via a later edit", async () => {
    const projectId = await createProject(`__stats_edit_value_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    const createRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: {} });
    const entryId = createRes.body.id;

    let sumRes = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "sum" });
    expect(sumRes.body.groups[0].value).toBe(0);

    await request(app).put(`/api/entries/${entryId}`).set(H).send({ values: { [hoursId]: 7 } });

    sumRes = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursId, operation: "sum" });
    expect(sumRes.body.groups[0].value).toBe(7);
  }, 30_000);
});

describe("Stats: timeline bucketing", () => {
  it("buckets by day using a DATE field's actual value, not the entry's createdAt", async () => {
    const projectId = await createProject(`__stats_timeline_${ts}`);
    const dateId = await createField(projectId, { name: "WorkDate", type: "DATE" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [dateId]: "2026-01-05" } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [dateId]: "2026-01-05" } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [dateId]: "2026-01-20" } });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: dateId, bucket: "day" });

    const byDate = Object.fromEntries(res.body.points.map((p: any) => [p.date, p.value]));
    expect(byDate["2026-01-05"]).toBe(2);
    expect(byDate["2026-01-20"]).toBe(1);
  }, 30_000);

  it("plots the sum of a NUMBER field per bucket instead of a plain entry count", async () => {
    const projectId = await createProject(`__stats_timeline_sum_${ts}`);
    const dateId = await createField(projectId, { name: "WorkDate", type: "DATE" });
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [dateId]: "2026-02-01", [hoursId]: 3 } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: { [dateId]: "2026-02-01", [hoursId]: 4 } });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: dateId, bucket: "day", operation: "sum", metricFieldId: hoursId });

    expect(res.status).toBe(200);
    expect(res.body.points[0].value).toBe(7); // 3 + 4, not a count of 2
  }, 30_000);

  it("rejects sum without a metricFieldId", async () => {
    const projectId = await createProject(`__stats_timeline_sum_missing_${ts}`);
    const dateId = await createField(projectId, { name: "WorkDate", type: "DATE" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: dateId, bucket: "day", operation: "sum" });

    expect(res.status).toBe(400);
  });
});

describe("Stats: timeline by the entry's own date (ENTRY_DATE)", () => {
  it("buckets by entryDate on a project that defines no DATE field at all", async () => {
    const projectId = await createProject(`__stats_timeline_entry_${ts}`);

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-03-02", values: {} });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-03-02", values: {} });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-03-15", values: {} });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: "ENTRY_DATE", bucket: "day" });

    expect(res.status).toBe(200);
    const byDate = Object.fromEntries(res.body.points.map((p: any) => [p.date, p.value]));
    expect(byDate["2026-03-02"]).toBe(2);
    expect(byDate["2026-03-15"]).toBe(1);
  }, 30_000);

  it("falls back to createdAt for an entry with no entryDate", async () => {
    const projectId = await createProject(`__stats_timeline_fallback_${ts}`);

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-03-15", values: {} });
    // No entryDate: the day it was created is the day it was done.
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: {} });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: "ENTRY_DATE", bucket: "day" });

    expect(res.status).toBe(200);
    // The dated entry lands on its own day; the undated one contributes a
    // second point on its created day, wherever today falls.
    const dated = res.body.points.find((p: any) => p.date === "2026-03-15");
    expect(dated.value).toBe(1);
    expect(res.body.points).toHaveLength(2);
  }, 30_000);

  it("sums a NUMBER field per bucket when plotting by entry date", async () => {
    const projectId = await createProject(`__stats_timeline_entry_sum_${ts}`);
    const hoursId = await createField(projectId, { name: "Hours", type: "NUMBER" });

    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-04-01", values: { [hoursId]: 3 } });
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, entryDate: "2026-04-01", values: { [hoursId]: 4 } });

    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: "ENTRY_DATE", bucket: "day", operation: "sum", metricFieldId: hoursId });

    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(1);
    expect(res.body.points[0].value).toBe(7);
  }, 30_000);
});
