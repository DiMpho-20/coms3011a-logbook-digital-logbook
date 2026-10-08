import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Issue #87: a backup is restored in full or not at all ────────────────

const USER = crypto.randomUUID();
const ts = Date.now();
let H: Record<string, string>;

const backup = (projects: unknown[]) => ({ format: "digital-logbook-backup", version: 1, exportedAt: new Date().toISOString(), projects });

const project = (name: string, extra: Record<string, unknown> = {}) => ({
  name, description: null, status: "ACTIVE", fields: [], entries: [], ...extra,
});

async function projectNames() {
  return (await prisma.project.findMany({ where: { userId: USER }, select: { name: true } })).map((p) => p.name);
}

beforeAll(async () => {
  await prisma.user.create({
    data: { id: USER, email: `import_${ts}@example.com`, passwordHash: await hashPassword("Password123"), fullName: "Importer", isEmailVerified: true },
  });
  H = { Authorization: `Bearer ${generateToken(USER)}` };
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER } }).catch(() => {});
});

describe("POST /api/import", () => {
  it("restores projects, fields and entries with every id remapped", async () => {
    const res = await request(app).post("/api/import").set(H).send(backup([
      project(`Thesis ${ts}`, {
        fields: [
          // The computed field is listed before the number it reads.
          { id: "old-cost", name: "Cost", type: "COMPUTED", required: false, formula: "{old-hours} * 10" },
          { id: "old-hours", name: "Hours", type: "NUMBER", required: true, formula: null },
          { id: "old-ref", name: "Related to", type: "REFERENCE", required: false, formula: null },
        ],
        entries: [
          {
            durationMinutes: 30, entryDate: "2026-09-01T00:00:00.000Z", dueDate: null,
            values: { "old-hours": 2, "old-cost": 999, "old-ref": { id: "gone", label: `Reading ${ts}`, kind: "project" } },
            status: "DONE", tags: ["exam"], archived: true,
          },
          // Made before Hours was required, so it has no value for it.
          { durationMinutes: 5, entryDate: null, dueDate: null, values: {} },
        ],
      }),
      project(`Reading ${ts}`),
    ]));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ projects: 2, entries: 2 });

    const thesis = await prisma.project.findFirstOrThrow({ where: { userId: USER, name: `Thesis ${ts}` } });
    const reading = await prisma.project.findFirstOrThrow({ where: { userId: USER, name: `Reading ${ts}` } });

    const fields = (await request(app).get(`/api/projects/${thesis.id}/entry-fields`).set(H)).body;
    expect(fields.map((f: { name: string }) => f.name)).toEqual(["Cost", "Hours", "Related to"]);
    const [cost, hours, ref] = fields;
    expect(cost.formula).toBe(`{${hours.id}} * 10`);

    const entries = (await request(app).get(`/api/projects/${thesis.id}/entries`).query({ archived: "include" }).set(H)).body;
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first.durationMinutes).toBe(30);
    expect(first.status).toBe("DONE");
    expect(first.archivedAt).not.toBeNull();
    expect(first.tags).toEqual(["exam"]);
    // The stored result is worked out again, not copied from the file.
    expect(first.values[cost.id]).toBe(20);
    expect(first.values[hours.id]).toBe(2);
    expect(first.values[ref.id]).toEqual({ id: reading.id, label: `Reading ${ts}`, kind: "project" });
    expect(first.format.fields.map((f: { name: string }) => f.name)).toEqual(["Cost", "Hours", "Related to"]);
    expect(second.durationMinutes).toBe(5);

    const { versions } = (await request(app).get(`/api/entries/${first.id}/versions`).set(H)).body;
    expect(versions).toHaveLength(1);
    expect(versions[0].reason).toBe("CREATED");
  });

  it("keeps project tags, original timestamps and links by id (issue #86)", async () => {
    const OLD_A = crypto.randomUUID();
    const OLD_B = crypto.randomUUID();
    const OLD_ENTRY = crypto.randomUUID();
    const res = await request(app).post("/api/import").set(H).send(backup([
      project(`Linked ${ts}`, {
        id: OLD_A,
        tags: ["semester-2"],
        createdAt: "2025-02-01T08:00:00.000Z",
        updatedAt: "2025-03-01T08:00:00.000Z",
        fields: [{ id: "link", name: "Link", type: "REFERENCE", required: false, formula: null }],
        entries: [{
          durationMinutes: 10, entryDate: null, dueDate: null,
          // Points at an entry restored after this one, and at a project
          // whose label went stale when it was renamed.
          values: { link: { id: OLD_ENTRY, label: "Lab 3", kind: "entry", projectId: OLD_B } },
          createdAt: "2025-02-02T09:00:00.000Z", updatedAt: "2025-02-05T09:00:00.000Z",
        }],
      }),
      project(`Target ${ts}`, {
        id: OLD_B,
        fields: [{ id: "back", name: "Back", type: "REFERENCE", required: false, formula: null }],
        entries: [{
          id: OLD_ENTRY, durationMinutes: 20, entryDate: null, dueDate: null,
          values: { back: { id: OLD_A, label: "Old name", kind: "project" } },
          status: "DONE", completedAt: "2025-02-03T10:00:00.000Z",
          archivedAt: "2025-02-04T10:00:00.000Z",
          createdAt: "2025-02-01T10:00:00.000Z", updatedAt: "2025-02-04T10:00:00.000Z",
        }],
      }),
    ]));
    expect(res.status).toBe(201);

    const a = await prisma.project.findFirstOrThrow({ where: { userId: USER, name: `Linked ${ts}` } });
    const b = await prisma.project.findFirstOrThrow({ where: { userId: USER, name: `Target ${ts}` } });
    expect(a.createdAt.toISOString()).toBe("2025-02-01T08:00:00.000Z");
    expect(a.updatedAt.toISOString()).toBe("2025-03-01T08:00:00.000Z");
    expect((await request(app).get(`/api/projects/${a.id}`).set(H)).body.tags).toEqual(["semester-2"]);

    const [target] = (await request(app).get(`/api/projects/${b.id}/entries`).query({ archived: "include" }).set(H)).body;
    expect(target.createdAt).toBe("2025-02-01T10:00:00.000Z");
    expect(target.updatedAt).toBe("2025-02-04T10:00:00.000Z");
    expect(target.completedAt).toBe("2025-02-03T10:00:00.000Z");
    expect(target.archivedAt).toBe("2025-02-04T10:00:00.000Z");
    const [backField] = (await request(app).get(`/api/projects/${b.id}/entry-fields`).set(H)).body;
    expect(target.values[backField.id]).toEqual({ id: a.id, label: "Old name", kind: "project" });

    const [linking] = (await request(app).get(`/api/projects/${a.id}/entries`).set(H)).body;
    const [linkField] = (await request(app).get(`/api/projects/${a.id}/entry-fields`).set(H)).body;
    expect(linking.createdAt).toBe("2025-02-02T09:00:00.000Z");
    expect(linking.values[linkField.id]).toEqual({ id: target.id, label: "Lab 3", kind: "entry", projectId: b.id });
  });

  it("imports a project whose name is already taken under a new name", async () => {
    const name = `Clash ${ts}`;
    await request(app).post("/api/projects").set(H).send({ name });

    const res = await request(app).post("/api/import").set(H).send(backup([project(name)]));

    expect(res.status).toBe(201);
    expect(await projectNames()).toEqual(expect.arrayContaining([name, `${name} (imported)`]));
  });

  it("imports nothing when a later part of the backup is invalid", async () => {
    const res = await request(app).post("/api/import").set(H).send(backup([
      project(`Fine ${ts}`, {
        fields: [{ id: "f", name: "Note", type: "TEXT", required: false, formula: null }],
        entries: [{ durationMinutes: 1, entryDate: null, dueDate: null, values: { f: "kept?" } }],
      }),
      project(`Broken ${ts}`, {
        fields: [{ id: "n", name: "Hours", type: "NUMBER", required: false, formula: null }],
        entries: [{ durationMinutes: 1, entryDate: null, dueDate: null, values: { n: "not a number" } }],
      }),
    ]));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Broken.*Nothing was imported/);
    const names = await projectNames();
    expect(names).not.toContain(`Fine ${ts}`);
    expect(names).not.toContain(`Broken ${ts}`);
  });

  it("imports nothing when two fields in a project share a name", async () => {
    const res = await request(app).post("/api/import").set(H).send(backup([
      project(`Dupes ${ts}`, {
        fields: [
          { id: "a", name: "Hours", type: "NUMBER", required: false, formula: null },
          { id: "b", name: "hours", type: "NUMBER", required: false, formula: null },
        ],
      }),
    ]));

    expect(res.status).toBe(409);
    expect(await projectNames()).not.toContain(`Dupes ${ts}`);
  });

  it("rejects computed fields that depend on each other in a loop", async () => {
    const res = await request(app).post("/api/import").set(H).send(backup([
      project(`Loop ${ts}`, {
        fields: [
          { id: "a", name: "A", type: "COMPUTED", required: false, formula: "{b} + 1" },
          { id: "b", name: "B", type: "COMPUTED", required: false, formula: "{a} + 1" },
        ],
      }),
    ]));

    expect(res.status).toBe(400);
    expect(await projectNames()).not.toContain(`Loop ${ts}`);
  });

  it("refuses a file that is not a backup", async () => {
    for (const body of [{}, { format: "something-else" }, { ...backup([]), version: 2 }, backup([{ name: "" }])]) {
      const res = await request(app).post("/api/import").set(H).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a valid/i);
    }
  });

  it("requires a signed-in user", async () => {
    expect((await request(app).post("/api/import").send(backup([]))).status).toBe(401);
  });
});
