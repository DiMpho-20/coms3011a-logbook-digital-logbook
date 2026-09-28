import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Fixtures ─────────────────────────────────────────────────────────────
// US16: an owner evaluates their own expression over their own entries, so
// every test needs a second owner to prove the scoping actually holds.

const OWNER = crypto.randomUUID();
const STRANGER = crypto.randomUUID();
const ts = Date.now();

let OWNER_AUTH: Record<string, string>;
let STRANGER_AUTH: Record<string, string>;
let projectId = "";
let strangerProjectId = "";

let sharedHash: Promise<string> | null = null;
const fixtureHash = () => (sharedHash ??= hashPassword("Password123"));

async function makeUser(id: string, label: string) {
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      email: `expr_${label}_${ts}@example.com`,
      passwordHash: await fixtureHash(),
      fullName: `Expression ${label}`,
      isEmailVerified: true,
    },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

const evaluate = (expression: unknown, auth = OWNER_AUTH, id = () => projectId) =>
  request(app).post(`/api/projects/${id()}/stats/expression`).set(auth).send({ expression });

beforeAll(async () => {
  [OWNER_AUTH, STRANGER_AUTH] = await Promise.all([
    makeUser(OWNER, "owner"),
    makeUser(STRANGER, "stranger"),
  ]);

  const project = await prisma.project.create({
    data: { userId: OWNER, name: `__expr_${ts}` },
  });
  projectId = project.id;

  const stranger = await prisma.project.create({
    data: { userId: STRANGER, name: `__expr_stranger_${ts}` },
  });
  strangerProjectId = stranger.id;

  // Fields are made directly so the computed field's formula can point at the
  // Hours id; entries then go through the API, so values are validated and
  // computed fields are worked out exactly as they are in the running app.
  const hours = await prisma.entryField.create({
    data: { projectId, name: "Hours", type: "NUMBER" },
  });
  await prisma.entryField.create({ data: { projectId, name: "Notes", type: "TEXT" } });
  await prisma.entryField.create({ data: { projectId, name: "Untouched", type: "NUMBER" } });
  await prisma.entryField.create({
    data: { projectId, name: "Doubled", type: "COMPUTED", formula: `{${hours.id}} * 2` },
  });

  const add = (values: Record<string, unknown>) =>
    request(app).post(`/api/projects/${projectId}/entries`).set(OWNER_AUTH).send({ durationMinutes: 0, values });

  await add({ [hours.id]: 2 });
  await add({ [hours.id]: 4 });
  await add({ [hours.id]: 6 });
  const fourth = await add({});

  // A value written before the blank-value fix (BUG-012) that cannot be read
  // as a number. It must be skipped, not crash the aggregate.
  await prisma.entryValue.create({
    data: { entryId: fourth.body.id, fieldId: hours.id, value: "not a number" },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, STRANGER] } } }).catch(() => {});
});

describe("POST /stats/expression — results", () => {
  it("counts every entry in the project", async () => {
    const res = await evaluate("COUNT()");
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(4);
  });

  it("totals a number field, skipping the value that is not a number", async () => {
    const res = await evaluate("SUM({Hours})");
    expect(res.body.value).toBe(12);
  });

  it("averages over the values it can read, not over every entry", async () => {
    // 12 across three readable values — not 12/4, and not spoiled by the
    // malformed row or the entry that never filled Hours in.
    const res = await evaluate("AVG({Hours})");
    expect(res.body.value).toBe(4);
  });

  it("finds the smallest and largest value", async () => {
    expect((await evaluate("MIN({Hours})")).body.value).toBe(2);
    expect((await evaluate("MAX({Hours})")).body.value).toBe(6);
  });

  it("divides one aggregate by another", async () => {
    const res = await evaluate("SUM({Hours}) / COUNT()");
    expect(res.body.value).toBe(3);
  });

  it("applies multiplication before addition", async () => {
    // 12 + (4 * 2) = 20, not (12 + 4) * 2 = 32
    expect((await evaluate("SUM({Hours}) + COUNT() * 2")).body.value).toBe(20);
    expect((await evaluate("(SUM({Hours}) + COUNT()) * 2")).body.value).toBe(32);
  });

  it("reads a computed field like any other number", async () => {
    // Doubled is {Hours} * 2, already worked out and stored per entry, so
    // this reuses the computed-field engine rather than repeating it.
    expect((await evaluate("SUM({Doubled})")).body.value).toBe(24);
  });

  it("matches a field name without caring about capitals", async () => {
    expect((await evaluate("SUM(hours)")).body.value).toBe(12);
  });

  it("totals a field nothing has filled in as zero", async () => {
    expect((await evaluate("SUM({Untouched})")).body.value).toBe(0);
  });

  it("refuses to average a field nothing has filled in", async () => {
    // Zero would be a wrong answer rather than an empty one.
    const res = await evaluate("AVG({Untouched})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no entry has a number/i);
  });
});

describe("POST /stats/expression — rejections", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/expression`)
      .send({ expression: "COUNT()" });
    expect(res.status).toBe(401);
  });

  it("will not evaluate against someone else's project", async () => {
    const res = await evaluate("COUNT()", OWNER_AUTH, () => strangerProjectId);
    expect(res.status).toBe(404);
    expect(res.body.value).toBeUndefined();
  });

  it("will not evaluate against a project that does not exist", async () => {
    const res = await evaluate("COUNT()", OWNER_AUTH, () => crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  it("rejects a request with no expression", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/stats/expression`)
      .set(OWNER_AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects an empty expression", async () => {
    expect((await evaluate("   ")).status).toBe(400);
  });

  it("names a field the project does not have", async () => {
    const res = await evaluate("SUM({Nonexistent})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no field called/i);
  });

  it("refuses to aggregate a field that is not numeric", async () => {
    const res = await evaluate("SUM({Notes})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Number or Computed/i);
  });

  it("refuses a function it does not have", async () => {
    const res = await evaluate("MEDIAN({Hours})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a function/i);
  });

  it("refuses unbalanced parentheses", async () => {
    expect((await evaluate("(SUM({Hours})")).status).toBe(400);
  });

  it("reports division by zero instead of returning Infinity", async () => {
    const res = await evaluate("SUM({Hours}) / 0");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/divides by zero/i);
  });

  it("refuses characters that could only be an attempt at something else", async () => {
    const res = await evaluate("SUM({Hours}); DROP TABLE users");
    expect(res.status).toBe(400);
    // The table is very much still there.
    expect((await evaluate("COUNT()")).body.value).toBe(4);
  });

  it("rejects an expression that is not a string", async () => {
    expect((await evaluate(42)).status).toBe(400);
  });
});
