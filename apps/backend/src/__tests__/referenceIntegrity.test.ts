import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { generateToken } from "../utils/auth.js";

// Issue #90: a REFERENCE value must point at something that exists, belongs
// to the student saving it, and is the kind it says it is.

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();
const HA = { Authorization: `Bearer ${generateToken(USER_A)}` };

let projectId: string; // where the entries are saved
let relatedProjectId: string; // another of A's projects, to point at
let relatedEntryId: string; // an entry of A's, to point at
let othersProjectId: string; // B's — never a valid target for A
let refFieldId: string;

const save = (ref: unknown) =>
  request(app)
    .post(`/api/projects/${projectId}/entries`)
    .set(HA)
    .send({ durationMinutes: 10, values: { [refFieldId]: ref } });

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: USER_A, email: `ref-a-${ts}@test.local`, passwordHash: "x", fullName: "Ref A", isEmailVerified: true },
      { id: USER_B, email: `ref-b-${ts}@test.local`, passwordHash: "x", fullName: "Ref B", isEmailVerified: true },
    ],
  });
  const [main, related, others] = await Promise.all([
    prisma.project.create({ data: { userId: USER_A, name: "Thesis" } }),
    prisma.project.create({ data: { userId: USER_A, name: "Reading" } }),
    prisma.project.create({ data: { userId: USER_B, name: "Not yours" } }),
  ]);
  projectId = main.id;
  relatedProjectId = related.id;
  othersProjectId = others.id;
  relatedEntryId = (await prisma.logbookEntry.create({ data: { projectId: related.id, durationMinutes: 5 } })).id;

  // Through the API, so the field comes with its format version as usual.
  const field = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(HA)
    .send({ name: "Related to", type: "REFERENCE", required: false });
  refFieldId = field.body.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
});

describe("saving a reference (issue #90)", () => {
  it("accepts one of the student's own projects", async () => {
    const res = await save({ id: relatedProjectId, label: "Reading", kind: "project" });
    expect(res.status).toBe(201);
  });

  it("reads a reference with no kind as a project, as older data has it", async () => {
    const res = await save({ id: relatedProjectId, label: "Reading" });
    expect(res.status).toBe(201);
  });

  it("accepts one of the student's own entries", async () => {
    const res = await save({ id: relatedEntryId, kind: "entry" });
    expect(res.status).toBe(201);
  });

  it("refuses a project that does not exist", async () => {
    const res = await save({ id: crypto.randomUUID(), kind: "project" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Related to" must reference one of your projects.');
  });

  it("refuses another student's project", async () => {
    const res = await save({ id: othersProjectId, kind: "project" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Related to" must reference one of your projects.');
  });

  it("refuses a reference whose kind does not match what it points at", async () => {
    const res = await save({ id: relatedProjectId, kind: "entry" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Related to" must reference one of your entries.');
  });

  it("refuses a kind that is neither project nor entry", async () => {
    // The request schema already turns this away, before the lookup runs.
    const res = await save({ id: relatedProjectId, kind: "tag" });
    expect(res.status).toBe(400);
  });

  it("refuses an id that is not an id at all", async () => {
    const res = await save({ id: "not-an-id", kind: "project" });
    expect(res.status).toBe(400);
  });

  it("still allows leaving the reference empty", async () => {
    const res = await save(null);
    expect(res.status).toBe(201);
  });
});

describe("editing a reference (issue #90)", () => {
  it("refuses a broken reference and keeps the one that was there", async () => {
    const created = await save({ id: relatedProjectId, kind: "project" });
    const entryId = created.body.id;

    const res = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(HA)
      .send({ values: { [refFieldId]: { id: othersProjectId, kind: "project" } } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Related to" must reference one of your projects.');

    const stored = await prisma.entryValue.findFirst({ where: { entryId, fieldId: refFieldId } });
    expect(JSON.parse(stored!.value).id).toBe(relatedProjectId);
  });

  it("accepts a change to another valid reference", async () => {
    const created = await save({ id: relatedProjectId, kind: "project" });

    const res = await request(app)
      .put(`/api/entries/${created.body.id}`)
      .set(HA)
      .send({ values: { [refFieldId]: { id: relatedEntryId, kind: "entry" } } });
    expect(res.status).toBe(200);
  });
});
