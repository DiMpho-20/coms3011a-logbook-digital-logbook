import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── GET /api/projects/time-summaries: every project's totals in one request,
// replacing the one request per project the list pages used to make.

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

interface SummaryRow {
  projectId: string;
  totalMinutes: number;
  totalHours: number;
  entryCount: number;
  lastEntryAt: string | null;
}

beforeAll(async () => {
  HA = await makeUser(USER_A, `tsum_a_${ts}@example.com`, "Summariser A");
  HB = await makeUser(USER_B, `tsum_b_${ts}@example.com`, "Summariser B");
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_A } }).catch(() => {});
  await prisma.user.delete({ where: { id: USER_B } }).catch(() => {});
});

describe("GET /api/projects/time-summaries", () => {
  it("totals every project in one answer, including projects with no entries", async () => {
    const withWork = await request(app).post("/api/projects").set(HA).send({ name: `__tsum_busy_${ts}` });
    const withoutWork = await request(app).post("/api/projects").set(HA).send({ name: `__tsum_idle_${ts}` });
    const first = await request(app)
      .post(`/api/projects/${withWork.body.id}/entries`)
      .set(HA)
      .send({ durationMinutes: 30, values: {} });
    const second = await request(app)
      .post(`/api/projects/${withWork.body.id}/entries`)
      .set(HA)
      .send({ durationMinutes: 45, values: {} });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const res = await request(app).get("/api/projects/time-summaries").set(HA);
    expect(res.status).toBe(200);
    const rows = res.body as SummaryRow[];
    const busy = rows.find((r) => r.projectId === withWork.body.id);
    const idle = rows.find((r) => r.projectId === withoutWork.body.id);

    expect(busy).toMatchObject({ totalMinutes: 75, totalHours: 1.3, entryCount: 2 });
    expect(busy!.lastEntryAt).toBeTruthy();
    // A project with no entries still gets its zero row, the way the
    // per-project endpoint has always answered for one.
    expect(idle).toMatchObject({ totalMinutes: 0, totalHours: 0, entryCount: 0, lastEntryAt: null });
  });

  it("only counts the signed-in student's own logbook", async () => {
    const mine = await request(app).post("/api/projects").set(HA).send({ name: `__tsum_mine_${ts}` });
    const theirs = await request(app).post("/api/projects").set(HB).send({ name: `__tsum_theirs_${ts}` });
    await request(app)
      .post(`/api/projects/${theirs.body.id}/entries`)
      .set(HB)
      .send({ durationMinutes: 500, values: {} });
    await request(app)
      .post(`/api/projects/${mine.body.id}/entries`)
      .set(HA)
      .send({ durationMinutes: 5, values: {} });

    const res = await request(app).get("/api/projects/time-summaries").set(HA);
    const rows = res.body as SummaryRow[];
    expect(rows.map((r) => r.projectId)).toContain(mine.body.id);
    expect(rows.map((r) => r.projectId)).not.toContain(theirs.body.id);
    expect(rows.find((r) => r.projectId === mine.body.id)!.totalMinutes).toBe(5);
  });

  it("requires signing in", async () => {
    const res = await request(app).get("/api/projects/time-summaries");
    expect(res.status).toBe(401);
  });
});
