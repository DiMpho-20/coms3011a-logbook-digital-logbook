import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── US20-22 (version history) and US30 (archiving) ───────────────────────

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();

let HA: Record<string, string>;
let HB: Record<string, string>;
let projectId: string;
let noteFieldId: string;

async function makeUser(id: string, email: string, name: string) {
  await prisma.user.create({
    data: { id, email, passwordHash: await hashPassword("Password123"), fullName: name, isEmailVerified: true },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

async function newEntry(note: string, durationMinutes = 30) {
  const res = await request(app)
    .post(`/api/projects/${projectId}/entries`)
    .set(HA)
    .send({ durationMinutes, values: { [noteFieldId]: note }, tags: ["first"] });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

beforeAll(async () => {
  HA = await makeUser(USER_A, `hist_a_${ts}@example.com`, "History A");
  HB = await makeUser(USER_B, `hist_b_${ts}@example.com`, "History B");

  const project = await request(app).post("/api/projects").set(HA).send({ name: `__hist_proj_${ts}` });
  projectId = project.body.id;

  const field = await request(app)
    .post(`/api/projects/${projectId}/entry-fields`)
    .set(HA)
    .send({ name: "Note", type: "TEXT", required: false });
  noteFieldId = field.body.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_A } }).catch(() => {});
  await prisma.user.delete({ where: { id: USER_B } }).catch(() => {});
});

describe("US20: editing an entry preserves the previous version", () => {
  it("starts a new entry at version 1", async () => {
    const id = await newEntry("original");
    const res = await request(app).get(`/api/entries/${id}/versions`).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.currentVersion).toBe(1);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].reason).toBe("CREATED");
    expect(res.body.versions[0].snapshot.values[noteFieldId]).toBe("original");
  });

  it("keeps the old content after an edit, oldest version first", async () => {
    const id = await newEntry("draft");
    await request(app).put(`/api/entries/${id}`).set(HA).send({ values: { [noteFieldId]: "second" } });
    await request(app).put(`/api/entries/${id}`).set(HA).send({ durationMinutes: 90 });

    const res = await request(app).get(`/api/entries/${id}/versions`).set(HA);
    expect(res.body.versions.map((v: { version: number }) => v.version)).toEqual([1, 2, 3]);
    expect(res.body.versions[0].snapshot.values[noteFieldId]).toBe("draft");
    expect(res.body.versions[1].snapshot.values[noteFieldId]).toBe("second");
    expect(res.body.versions[2].snapshot.durationMinutes).toBe(90);

    const times = res.body.versions.map((v: { createdAt: string }) => Date.parse(v.createdAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("shows the latest version as the current entry", async () => {
    const id = await newEntry("before");
    await request(app).put(`/api/entries/${id}`).set(HA).send({ values: { [noteFieldId]: "after" } });
    const list = await request(app).get(`/api/projects/${projectId}/entries`).set(HA);
    const current = list.body.find((e: { id: string }) => e.id === id);
    expect(current.values[noteFieldId]).toBe("after");
  });

  it("does not add a version for a save that changes nothing", async () => {
    const id = await newEntry("same");
    await request(app).put(`/api/entries/${id}`).set(HA).send({ values: { [noteFieldId]: "same" } });
    const res = await request(app).get(`/api/entries/${id}/versions`).set(HA);
    expect(res.body.versions).toHaveLength(1);
  });

  it("records a status change as a version", async () => {
    const id = await newEntry("task");
    await request(app).patch(`/api/entries/${id}/status`).set(HA).send({ status: "DONE" });
    const res = await request(app).get(`/api/entries/${id}/versions`).set(HA);
    expect(res.body.versions).toHaveLength(2);
    expect(res.body.versions[1].snapshot.status).toBe("DONE");
  });

  it("presents an entry from before history existed as version 1", async () => {
    // Written straight to the database, the way entries were before versions.
    const legacy = await prisma.logbookEntry.create({
      data: { projectId, durationMinutes: 15, values: { create: [{ fieldId: noteFieldId, value: "legacy" }] } },
    });
    const res = await request(app).get(`/api/entries/${legacy.id}/versions`).set(HA);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].snapshot.values[noteFieldId]).toBe("legacy");

    await request(app).put(`/api/entries/${legacy.id}`).set(HA).send({ values: { [noteFieldId]: "edited" } });
    const after = await request(app).get(`/api/entries/${legacy.id}/versions`).set(HA);
    expect(after.body.versions).toHaveLength(2);
    expect(after.body.versions[0].snapshot.values[noteFieldId]).toBe("legacy");
  });
});

describe("US21: viewing an entry as it was on a date", () => {
  let id: string;
  let betweenEdits: Date;

  beforeAll(async () => {
    id = await newEntry("as created");
    betweenEdits = new Date();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await request(app).put(`/api/entries/${id}`).set(HA).send({ values: { [noteFieldId]: "as edited" } });
  });

  it("shows the version that applied at that moment", async () => {
    const res = await request(app).get(`/api/entries/${id}/versions/at`).query({ date: betweenEdits.toISOString() }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.existed).toBe(true);
    expect(res.body.version.version).toBe(1);
    expect(res.body.version.snapshot.values[noteFieldId]).toBe("as created");
    expect(res.body.isCurrent).toBe(false);
  });

  it("shows the current version for now", async () => {
    const res = await request(app).get(`/api/entries/${id}/versions/at`).query({ date: new Date().toISOString() }).set(HA);
    expect(res.body.version.version).toBe(2);
    expect(res.body.isCurrent).toBe(true);
  });

  it("says the entry did not exist yet before it was created", async () => {
    const res = await request(app).get(`/api/entries/${id}/versions/at`).query({ date: "2000-01-01T00:00:00Z" }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.existed).toBe(false);
    expect(res.body.entryCreatedAt).toBeTruthy();
  });

  it("rejects a missing or invalid date", async () => {
    const res = await request(app).get(`/api/entries/${id}/versions/at`).query({ date: "not-a-date" }).set(HA);
    expect(res.status).toBe(400);
  });
});

describe("US22: restoring a previous version", () => {
  it("makes the chosen version current and keeps every version", async () => {
    const id = await newEntry("good", 30);
    await request(app).put(`/api/entries/${id}`).set(HA).send({ values: { [noteFieldId]: "mistake" }, durationMinutes: 5, tags: ["oops"] });

    const res = await request(app).post(`/api/entries/${id}/versions/1/restore`).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.entry.values[noteFieldId]).toBe("good");
    expect(res.body.entry.durationMinutes).toBe(30);
    expect(res.body.entry.tags).toEqual(["first"]);
    expect(res.body.version.reason).toBe("RESTORED");
    expect(res.body.version.restoredFromVersion).toBe(1);

    const history = await request(app).get(`/api/entries/${id}/versions`).set(HA);
    expect(history.body.versions).toHaveLength(3);
    expect(history.body.versions[1].snapshot.values[noteFieldId]).toBe("mistake");
    expect(history.body.currentVersion).toBe(3);
  });

  it("returns 404 for a version that does not exist", async () => {
    const id = await newEntry("only one");
    const res = await request(app).post(`/api/entries/${id}/versions/7/restore`).set(HA);
    expect(res.status).toBe(404);
  });
});

describe("US30: archiving entries", () => {
  it("moves an entry out of the active list and into the archive", async () => {
    const id = await newEntry("old work");
    const archived = await request(app).patch(`/api/entries/${id}/archive`).set(HA).send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toBeTruthy();

    const active = await request(app).get(`/api/projects/${projectId}/entries`).set(HA);
    expect(active.body.some((e: { id: string }) => e.id === id)).toBe(false);

    const archive = await request(app).get(`/api/projects/${projectId}/entries`).query({ archived: "only" }).set(HA);
    expect(archive.body.some((e: { id: string }) => e.id === id)).toBe(true);
    expect(archive.body.every((e: { archivedAt: string | null }) => e.archivedAt)).toBe(true);
  });

  it("restores an archived entry to the active logbook", async () => {
    const id = await newEntry("back again");
    await request(app).patch(`/api/entries/${id}/archive`).set(HA).send({ archived: true });
    await request(app).patch(`/api/entries/${id}/archive`).set(HA).send({ archived: false });
    const active = await request(app).get(`/api/projects/${projectId}/entries`).set(HA);
    expect(active.body.some((e: { id: string }) => e.id === id)).toBe(true);
  });

  it("archives several selected entries at once", async () => {
    const ids = [await newEntry("bulk one"), await newEntry("bulk two")];
    const res = await request(app).post("/api/entries/archive").set(HA).send({ ids, archived: true });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it("keeps archived entries retrievable in the cross-project listing when asked", async () => {
    const id = await newEntry("findable later");
    await request(app).patch(`/api/entries/${id}/archive`).set(HA).send({ archived: true });

    const normal = await request(app).get("/api/entries").set(HA);
    expect(normal.body.entries.some((e: { id: string }) => e.id === id)).toBe(false);

    const withArchive = await request(app).get("/api/entries").query({ archived: "include" }).set(HA);
    expect(withArchive.body.entries.some((e: { id: string }) => e.id === id)).toBe(true);
  });

  it("rejects an unknown archived filter", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/entries`).query({ archived: "sometimes" }).set(HA);
    expect(res.status).toBe(400);
  });
});

describe("another user's entry history is unreachable", () => {
  it("does not show, restore or archive it", async () => {
    const id = await newEntry("private");
    expect((await request(app).get(`/api/entries/${id}/versions`).set(HB)).status).toBe(404);
    expect((await request(app).get(`/api/entries/${id}/versions/at`).query({ date: new Date().toISOString() }).set(HB)).status).toBe(404);
    expect((await request(app).post(`/api/entries/${id}/versions/1/restore`).set(HB)).status).toBe(404);
    expect((await request(app).patch(`/api/entries/${id}/archive`).set(HB).send({ archived: true })).status).toBe(404);

    const bulk = await request(app).post("/api/entries/archive").set(HB).send({ ids: [id], archived: true });
    expect(bulk.body.updated).toBe(0);
  });
});
