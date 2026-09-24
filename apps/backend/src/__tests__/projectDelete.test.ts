import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── BUG-015: a project can be deleted permanently, not only archived ─────

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

/** A project with one field and two entries, one of them edited so it has history. */
async function populatedProject(name: string) {
  const project = await request(app).post("/api/projects").set(HA).send({ name, tags: ["doomed"] });
  const field = await request(app)
    .post(`/api/projects/${project.body.id}/entry-fields`)
    .set(HA)
    .send({ name: "Note", type: "TEXT", required: false });
  const first = await request(app)
    .post(`/api/projects/${project.body.id}/entries`)
    .set(HA)
    .send({ durationMinutes: 10, values: { [field.body.id]: "one" } });
  await request(app)
    .post(`/api/projects/${project.body.id}/entries`)
    .set(HA)
    .send({ durationMinutes: 20, values: { [field.body.id]: "two" } });
  await request(app).put(`/api/entries/${first.body.id}`).set(HA).send({ durationMinutes: 15 });
  return { projectId: project.body.id as string, fieldId: field.body.id as string, entryId: first.body.id as string };
}

beforeAll(async () => {
  HA = await makeUser(USER_A, `pdel_a_${ts}@example.com`, "Deleter A");
  HB = await makeUser(USER_B, `pdel_b_${ts}@example.com`, "Intruder B");
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_A } }).catch(() => {});
  await prisma.user.delete({ where: { id: USER_B } }).catch(() => {});
});

describe("DELETE /api/projects/:id", () => {
  it("removes the project and everything recorded under it", async () => {
    const { projectId, fieldId, entryId } = await populatedProject(`__pdel_${ts}`);

    const res = await request(app).delete(`/api/projects/${projectId}`).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.deletedEntries).toBe(2);

    expect((await request(app).get(`/api/projects/${projectId}`).set(HA)).status).toBe(404);
    expect(await prisma.entryField.count({ where: { id: fieldId } })).toBe(0);
    expect(await prisma.logbookEntry.count({ where: { projectId } })).toBe(0);
    expect(await prisma.entryVersion.count({ where: { entryId } })).toBe(0);
    expect(await prisma.projectTag.count({ where: { projectId } })).toBe(0);
  });

  it("lets the name be reused afterwards", async () => {
    const name = `__pdel_reuse_${ts}`;
    const first = await request(app).post("/api/projects").set(HA).send({ name });
    await request(app).delete(`/api/projects/${first.body.id}`).set(HA);
    const again = await request(app).post("/api/projects").set(HA).send({ name });
    expect(again.status).toBe(201);
  });

  it("leaves the user's other projects alone", async () => {
    const keep = await request(app).post("/api/projects").set(HA).send({ name: `__pdel_keep_${ts}` });
    const drop = await request(app).post("/api/projects").set(HA).send({ name: `__pdel_drop_${ts}` });
    await request(app).delete(`/api/projects/${drop.body.id}`).set(HA);
    expect((await request(app).get(`/api/projects/${keep.body.id}`).set(HA)).status).toBe(200);
  });

  it("returns 404 for a project that doesn't exist", async () => {
    const res = await request(app).delete(`/api/projects/${crypto.randomUUID()}`).set(HA);
    expect(res.status).toBe(404);
  });

  it("does not let another user delete it", async () => {
    const project = await request(app).post("/api/projects").set(HA).send({ name: `__pdel_private_${ts}` });
    const res = await request(app).delete(`/api/projects/${project.body.id}`).set(HB);
    expect(res.status).toBe(404);
    expect((await request(app).get(`/api/projects/${project.body.id}`).set(HA)).status).toBe(200);
  });

  it("requires signing in", async () => {
    const project = await request(app).post("/api/projects").set(HA).send({ name: `__pdel_anon_${ts}` });
    const res = await request(app).delete(`/api/projects/${project.body.id}`);
    expect(res.status).toBe(401);
  });
});
