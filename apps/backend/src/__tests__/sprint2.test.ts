import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Shared constants ─────────────────────────────────────────────────────

const USER_ID = crypto.randomUUID();
const ts = Date.now();
const TEST_EMAIL = `sprint2_${ts}@example.com`;
const TEST_PASSWORD = "Password123";
const PROJECT_NAME = `__sprint2_${ts}`;

let projectId: string;
let hoursFieldId: string;
let categoryFieldId: string;
let workDateFieldId: string;
let statusEntryId: string;
let H: Record<string, string>;

// Entries created in beforeAll:
//   A: hours=60,  category=Lab,     workDate=2026-09-01
//   B: hours=45,  category=Lab,     workDate=2026-09-01
//   C: hours=90,  category=Reading, workDate=2026-09-10
// → sum=195, avg=65, count=3; Lab=105, Reading=90.

// ── Setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullName: "Sprint 2 Test User",
      isEmailVerified: true,
    },
  });

  H = { Authorization: `Bearer ${generateToken(USER_ID)}` };

  // Project
  const projectRes = await request(app)
    .post("/api/projects")
    .set(H)
    .send({ name: PROJECT_NAME, description: "Sprint 2 test project" });
  projectId = projectRes.body.id;

  // Fields — created sequentially: each create bumps the project's format
  // version (read-latest-then-insert), so parallel creates race on the
  // unique (projectId, version) constraint.
  const hoursRes = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "Hours", type: "NUMBER" });
  hoursFieldId = hoursRes.body.id;

  const categoryRes = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "Category", type: "TEXT" });
  categoryFieldId = categoryRes.body.id;

  const workDateRes = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(H)
    .send({ name: "WorkDate", type: "DATE" });
  workDateFieldId = workDateRes.body.id;

  // Entries (independent — create in parallel)
  const entryData = [
    { hours: "60", category: "Lab", workDate: "2026-09-01" },
    { hours: "45", category: "Lab", workDate: "2026-09-01" },
    { hours: "90", category: "Reading", workDate: "2026-09-10" },
  ];
  await Promise.all(
    entryData.map((d) =>
      request(app)
        .post(`/api/projects/${projectId}/entries`)
        .set(H)
        .send({
          durationMinutes: Number(d.hours),
          values: {
            [hoursFieldId]: d.hours,
            [categoryFieldId]: d.category,
            [workDateFieldId]: d.workDate,
          },
          entryDate: d.workDate,
        })
    )
  );
}, 60_000);

afterAll(async () => {
  // Deleting the user cascades to project, fields, entries, and values.
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
});

// ── Entry Status (US13) ──────────────────────────────────────────────────

describe("Entry status tracking", () => {
  it("creates an entry with default OPEN status", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 10, values: {} });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.completedAt).toBeNull();
    statusEntryId = res.body.id;
  });

  it("PATCH /entries/:id/status marks entry DONE and sets completedAt", async () => {
    const res = await request(app)
      .patch(`/api/entries/${statusEntryId}/status`)
      .set(H)
      .send({ status: "DONE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DONE");
    expect(res.body.completedAt).not.toBeNull();
  });

  it("PATCH /entries/:id/status back to OPEN clears completedAt", async () => {
    const res = await request(app)
      .patch(`/api/entries/${statusEntryId}/status`)
      .set(H)
      .send({ status: "OPEN" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.completedAt).toBeNull();
  });

  it("PATCH /entries/:id/status rejects invalid status → 400", async () => {
    const res = await request(app)
      .patch(`/api/entries/${statusEntryId}/status`)
      .set(H)
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("OPEN or DONE");
  });

  it("PATCH /entries/:id/status returns 404 for unknown id", async () => {
    const res = await request(app)
      .patch("/api/entries/00000000-0000-0000-0000-000000000000/status")
      .set(H)
      .send({ status: "DONE" });

    expect(res.status).toBe(404);
  });

  it("GET entries supports ?status= filter (open work view)", async () => {
    // Mark one entry DONE, then verify filtering
    await request(app)
      .patch(`/api/entries/${statusEntryId}/status`)
      .set(H)
      .send({ status: "DONE" });

    const openRes = await request(app)
      .get(`/api/projects/${projectId}/entries?status=OPEN`)
      .set(H);
    expect(openRes.status).toBe(200);
    expect(openRes.body.every((e: any) => e.status === "OPEN")).toBe(true);
    expect(openRes.body.length).toBe(3); // the three setup entries

    const doneRes = await request(app)
      .get(`/api/projects/${projectId}/entries?status=DONE`)
      .set(H);
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.length).toBe(1);
    expect(doneRes.body[0].id).toBe(statusEntryId);
  });

  it("GET entries supports ?dueBefore= filter (overdue buckets)", async () => {
    // The setup entries have no dueDate; create one with a past due date
    await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({
        durationMinutes: 5,
        values: {},
        dueDate: "2026-01-01",
      });

    const res = await request(app)
      .get(`/api/projects/${projectId}/entries?dueBefore=2026-02-01`)
      .set(H);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].dueDate).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ── Field Statistics (US11) ──────────────────────────────────────────────

describe("Stats grouping (POST /projects/:id/stats/group)", () => {
  it("sums a NUMBER field across entries", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "sum" });

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].key).toBe("total");
    expect(res.body.groups[0].value).toBe(195); // 60 + 45 + 90
  });

  it("averages a NUMBER field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "avg" });

    expect(res.status).toBe(200);
    expect(res.body.groups[0].value).toBe(65); // 195 / 3
  });

  it("counts entries with a TEXT metric field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: categoryFieldId, operation: "count" });

    expect(res.status).toBe(200);
    expect(res.body.groups[0].value).toBeGreaterThanOrEqual(3);
  });

  it("groups a NUMBER metric by a TEXT field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({
        metricFieldId: hoursFieldId,
        operation: "sum",
        groupByFieldId: categoryFieldId,
      });

    expect(res.status).toBe(200);
    const groups = res.body.groups as { key: string; value: number }[];
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.value]));
    expect(byKey["Lab"]).toBe(105); // 60 + 45
    expect(byKey["Reading"]).toBe(90);
    // Ordered by value descending
    expect(groups[0].key).toBe("Lab");
  });

  it("rejects missing metricFieldId → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ operation: "sum" });

    expect(res.status).toBe(400);
  });

  it("rejects an unsupported operation → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: hoursFieldId, operation: "median" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("operation must be one of");
  });

  it("rejects sum on a non-NUMBER field → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({ metricFieldId: categoryFieldId, operation: "sum" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("requires a NUMBER field");
  });

  it("returns 404 for an unknown metric field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({
        metricFieldId: "00000000-0000-0000-0000-000000000000",
        operation: "sum",
      });

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown group-by field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/group`)
      .set(H)
      .send({
        metricFieldId: hoursFieldId,
        operation: "sum",
        groupByFieldId: "00000000-0000-0000-0000-000000000000",
      });

    expect(res.status).toBe(404);
  });
});

// ── Timeline Statistics (US11/US12) ──────────────────────────────────────

describe("Stats timeline (POST /projects/:id/stats/timeline)", () => {
  it("buckets entry counts by day using a DATE field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: workDateFieldId, bucket: "day" });

    expect(res.status).toBe(200);
    const points = res.body.points as { date: string; count: number }[];
    const byDate = Object.fromEntries(points.map((p) => [p.date, p.count]));
    expect(byDate["2026-09-01"]).toBe(2);
    expect(byDate["2026-09-10"]).toBe(1);
    // Sorted ascending
    expect(points[0].date).toBe("2026-09-01");
  });

  it("supports month bucketing", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: workDateFieldId, bucket: "month" });

    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(1); // both dates fall in 2026-09
    expect(res.body.points[0].date).toBe("2026-09-01");
    expect(res.body.points[0].count).toBeGreaterThanOrEqual(3);
  });

  it("rejects an invalid bucket → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: workDateFieldId, bucket: "year" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("bucket must be day, week, or month");
  });

  it("rejects a non-DATE field → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ dateFieldId: categoryFieldId, bucket: "day" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("DATE field");
  });

  it("rejects a missing dateFieldId → 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({ bucket: "day" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown date field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/timeline`)
      .set(H)
      .send({
        dateFieldId: "00000000-0000-0000-0000-000000000000",
        bucket: "day",
      });

    expect(res.status).toBe(404);
  });
});
