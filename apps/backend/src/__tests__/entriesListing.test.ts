import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Fixtures ─────────────────────────────────────────────────────────────
// Two users, because the point of this endpoint is that it is scoped to one
// of them. Every assertion about what user A sees is paired with one about
// what user B must not.

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();

let HA: Record<string, string>;
let HB: Record<string, string>;

let activeProjectId: string;
let archivedProjectId: string;
let otherUsersProjectId: string;

// A deliberately backdated entry: created now, but dated in March.
const BACKDATED = new Date("2026-03-01T09:00:00.000Z");

async function makeUser(id: string, email: string, name: string) {
  await prisma.user.create({
    data: {
      id,
      email,
      passwordHash: await hashPassword("Password123"),
      fullName: name,
      isEmailVerified: true,
    },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

beforeAll(async () => {
  HA = await makeUser(USER_A, `entries_a_${ts}@example.com`, "Entries User A");
  HB = await makeUser(USER_B, `entries_b_${ts}@example.com`, "Entries User B");

  const activeRes = await request(app).post("/api/projects").set(HA).send({ name: `__el_active_${ts}` });
  activeProjectId = activeRes.body.id;

  const archivedRes = await request(app).post("/api/projects").set(HA).send({ name: `__el_archived_${ts}` });
  archivedProjectId = archivedRes.body.id;
  await request(app).patch(`/api/projects/${archivedProjectId}/status`).set(HA).send({ status: "ARCHIVED" });

  const otherRes = await request(app).post("/api/projects").set(HB).send({ name: `__el_other_${ts}` });
  otherUsersProjectId = otherRes.body.id;

  // A field on the active project, which creates a format version the
  // entries below can be pinned to.
  await request(app)
    .post(`/api/projects/${activeProjectId}/entry-fields`)
    .set(HA)
    .send({ name: "Summary", type: "TEXT", required: false });

  const version = await prisma.entryFormatVersion.findFirst({
    where: { projectId: activeProjectId },
    orderBy: { version: "desc" },
  });

  // Entries are created through Prisma rather than the API so that
  // entry_date and created_at can be set precisely — the ordering and the
  // from/to filter are the whole point of this endpoint.
  await prisma.logbookEntry.createMany({
    data: [
      { projectId: activeProjectId, durationMinutes: 30, entryDate: BACKDATED, formatVersionId: version?.id },
      { projectId: activeProjectId, durationMinutes: 45, entryDate: null, formatVersionId: version?.id },
      { projectId: archivedProjectId, durationMinutes: 60, entryDate: null },
      { projectId: otherUsersProjectId, durationMinutes: 90, entryDate: null },
    ],
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: USER_A } }).catch(() => {});
  await prisma.user.delete({ where: { id: USER_B } }).catch(() => {});
});

// ── Ownership ────────────────────────────────────────────────────────────

describe("GET /api/entries — ownership", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/entries");
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own entries", async () => {
    const res = await request(app).get("/api/entries").set(HA);
    expect(res.status).toBe(200);

    const projectIds = res.body.entries.map((e: any) => e.projectId);
    expect(projectIds).toContain(activeProjectId);
    expect(projectIds).toContain(archivedProjectId);
    expect(projectIds).not.toContain(otherUsersProjectId);
  });

  it("never returns another user's entries, even when their project id is supplied", async () => {
    const res = await request(app)
      .get("/api/entries")
      .query({ projectId: otherUsersProjectId })
      .set(HA);

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("does not leak user A's entries to user B", async () => {
    const res = await request(app).get("/api/entries").set(HB);
    expect(res.status).toBe(200);

    const projectIds = res.body.entries.map((e: any) => e.projectId);
    expect(projectIds).toEqual([otherUsersProjectId]);
  });
});

// ── Filters ──────────────────────────────────────────────────────────────

describe("GET /api/entries — filters", () => {
  it("filters to a single project", async () => {
    const res = await request(app).get("/api/entries").query({ projectId: activeProjectId }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.every((e: any) => e.projectId === activeProjectId)).toBe(true);
  });

  it("excludes archived projects when projectStatus=ACTIVE", async () => {
    const res = await request(app).get("/api/entries").query({ projectStatus: "ACTIVE" }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: any) => e.projectId)).not.toContain(archivedProjectId);
  });

  it("returns only archived projects when projectStatus=ARCHIVED", async () => {
    const res = await request(app).get("/api/entries").query({ projectStatus: "ARCHIVED" }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: any) => e.projectId)).toEqual([archivedProjectId]);
  });

  it("places a backdated entry in the window its entry date falls in, not the one it was created in", async () => {
    const inMarch = await request(app)
      .get("/api/entries")
      .query({ from: "2026-02-25", to: "2026-03-05" })
      .set(HA);

    expect(inMarch.status).toBe(200);
    expect(inMarch.body.entries).toHaveLength(1);
    expect(inMarch.body.entries[0].durationMinutes).toBe(30);
  });

  it("omits the backdated entry from a window covering only today", async () => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 1);

    const res = await request(app)
      .get("/api/entries")
      .query({ from: from.toISOString(), to: new Date(today.getTime() + 86_400_000).toISOString() })
      .set(HA);

    expect(res.status).toBe(200);
    expect(res.body.entries.some((e: any) => e.durationMinutes === 30)).toBe(false);
  });
});

// ── Ordering, limit, shape ───────────────────────────────────────────────

describe("GET /api/entries — ordering, limit and shape", () => {
  it("orders newest first by the date the interface shows", async () => {
    const res = await request(app).get("/api/entries").query({ projectId: activeProjectId }).set(HA);
    // The undated entry falls back to created_at (today) and so precedes the
    // one dated in March.
    expect(res.body.entries[0].durationMinutes).toBe(45);
    expect(res.body.entries[1].durationMinutes).toBe(30);
  });

  it("honours limit and reports truncation", async () => {
    const res = await request(app).get("/api/entries").query({ limit: 1 }).set(HA);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.truncated).toBe(true);
  });

  it("defaults the limit to 200 and caps it at 500", async () => {
    const dflt = await request(app).get("/api/entries").set(HA);
    expect(dflt.body.limit).toBe(200);
    expect(dflt.body.truncated).toBe(false);

    const capped = await request(app).get("/api/entries").query({ limit: 9999 }).set(HA);
    expect(capped.body.limit).toBe(500);
  });

  it("returns formats once in a shared map rather than on every entry", async () => {
    const res = await request(app).get("/api/entries").query({ projectId: activeProjectId }).set(HA);

    const entry = res.body.entries[0];
    expect(entry).not.toHaveProperty("format");
    expect(entry.formatVersionId).toBeTruthy();

    const format = res.body.formats[entry.formatVersionId];
    expect(format).toBeTruthy();
    expect(Array.isArray(format.fields)).toBe(true);
    expect(format.fields.some((f: any) => f.name === "Summary")).toBe(true);

    // Both entries share one format, so the map holds a single key.
    expect(Object.keys(res.body.formats)).toHaveLength(1);
  });

  it("rejects invalid parameters", async () => {
    const badStatus = await request(app).get("/api/entries").query({ projectStatus: "NOPE" }).set(HA);
    expect(badStatus.status).toBe(400);

    const badLimit = await request(app).get("/api/entries").query({ limit: "0" }).set(HA);
    expect(badLimit.status).toBe(400);

    const badDate = await request(app).get("/api/entries").query({ from: "not-a-date" }).set(HA);
    expect(badDate.status).toBe(400);
  });
});
