import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// Two rules the entry format depends on:
//   BUG-001  concurrent field changes must not collide on the version number
//   —        a project cannot have two live fields with the same name

const ts = Date.now();
const USER_ID = crypto.randomUUID();
const PROJECT_ID = crypto.randomUUID();

let auth: Record<string, string>;

const fieldsUrl = `/api/projects/${PROJECT_ID}/entry-fields`;

const createField = (name: string, over: Record<string, unknown> = {}) =>
  request(app).post(fieldsUrl).set(auth).send({ name, type: "NUMBER", required: false, ...over });

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `fieldintegrity_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: "Field Integrity",
      isEmailVerified: true,
    },
  });
  await prisma.project.create({ data: { id: PROJECT_ID, userId: USER_ID, name: `Field integrity ${ts}` } });
  auth = { Authorization: `Bearer ${generateToken(USER_ID)}` };
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_ID } });
});

beforeEach(async () => {
  await prisma.entryFormatVersion.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.entryField.deleteMany({ where: { projectId: PROJECT_ID } });
});

describe("BUG-001 — concurrent field creation", () => {
  it("creates both fields when two requests arrive together", async () => {
    // The reproduction from the bug report. Before the fix one of these came
    // back 400, because both requests read the same latest format version and
    // both tried to write version + 1.
    const [first, second] = await Promise.all([createField("Alpha"), createField("Beta")]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await prisma.entryField.count({ where: { projectId: PROJECT_ID, archivedAt: null } })).toBe(2);
  });

  it("gives every format version a distinct, gapless number", async () => {
    await Promise.all(["One", "Two", "Three", "Four"].map((name) => createField(name)));

    const versions = await prisma.entryFormatVersion.findMany({
      where: { projectId: PROJECT_ID },
      orderBy: { version: "asc" },
      select: { version: true },
    });

    expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4]);
  });

  it("keeps each version's snapshot consistent with the field count", async () => {
    // What the transaction buys, as distinct from the retry: the fields written
    // into a version are the fields that existed when its number was chosen.
    await Promise.all(["A", "B", "C"].map((name) => createField(name)));

    const versions = await prisma.entryFormatVersion.findMany({
      where: { projectId: PROJECT_ID },
      orderBy: { version: "asc" },
    });

    for (const version of versions) {
      const fields = version.fields as { id: string }[];
      const ids = fields.map((field) => field.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // The newest version sees all three.
    expect((versions[versions.length - 1].fields as unknown[]).length).toBe(3);
  });

  it("survives concurrent deletes, which bump the version too", async () => {
    const created = await Promise.all(["Del1", "Del2"].map((name) => createField(name)));
    const ids = created.map((res) => res.body.id);

    const results = await Promise.all(
      ids.map((id) => request(app).delete(`/api/entry-fields/${id}`).set(auth))
    );

    expect(results.map((res) => res.status)).toEqual([204, 204]);
  });
});

describe("one field name per project", () => {
  it("refuses a second field with the same name", async () => {
    expect((await createField("Hours")).status).toBe(201);

    const duplicate = await createField("Hours");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already exists/i);
  });

  it("refuses a name that differs only by case or surrounding space", async () => {
    // "Hours" and "hours" are the same field to everybody but a byte
    // comparison, and a trailing space is invisible on screen.
    await createField("Hours");

    expect((await createField("hours")).status).toBe(409);
    expect((await createField("HOURS")).status).toBe(409);
    expect((await createField("  Hours  ")).status).toBe(409);
  });

  it("refuses a rename onto another field's name", async () => {
    await createField("Hours");
    const notes = await createField("Notes");

    const renamed = await request(app)
      .put(`/api/entry-fields/${notes.body.id}`)
      .set(auth)
      .send({ name: "Hours" });

    expect(renamed.status).toBe(409);
    // The field keeps the name it had.
    expect((await prisma.entryField.findUnique({ where: { id: notes.body.id } }))?.name).toBe("Notes");
  });

  it("lets a field keep its own name through an unrelated edit", async () => {
    const field = await createField("Hours");

    const updated = await request(app)
      .put(`/api/entry-fields/${field.body.id}`)
      .set(auth)
      .send({ name: "Hours", required: true });

    expect(updated.status).toBe(200);
    expect(updated.body.required).toBe(true);
  });

  it("releases the name when the field is removed", async () => {
    // Removal archives rather than deletes, so without the archivedAt clause
    // the name would stay reserved forever by a field nobody can see.
    const field = await createField("Hours");
    expect((await request(app).delete(`/api/entry-fields/${field.body.id}`).set(auth)).status).toBe(204);

    expect((await createField("Hours")).status).toBe(201);
  });

  it("does not stop two projects using the same name", async () => {
    const otherId = crypto.randomUUID();
    await prisma.project.create({ data: { id: otherId, userId: USER_ID, name: `Other ${ts}` } });

    await createField("Hours");
    const elsewhere = await request(app)
      .post(`/api/projects/${otherId}/entry-fields`)
      .set(auth)
      .send({ name: "Hours", type: "NUMBER", required: false });

    expect(elsewhere.status).toBe(201);
    await prisma.project.delete({ where: { id: otherId } });
  });

  it("holds even when two identical names are created at the same moment", async () => {
    // The API pre-check is a read then a write, so it races exactly the way
    // BUG-001 did. The partial unique index is what actually decides this, and
    // the loser must come back as the same friendly 409.
    const results = await Promise.all([createField("Race"), createField("Race")]);
    const statuses = results.map((res) => res.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await prisma.entryField.count({ where: { projectId: PROJECT_ID, archivedAt: null, name: "Race" } })).toBe(1);
  });
});
