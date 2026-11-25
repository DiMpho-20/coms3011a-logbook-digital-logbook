import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { generateToken } from "../utils/auth.js";

// GET /me/open-entries — the single request behind the Open Work page.
// Two users, so every claim about what one sees is paired with what the
// other must not.

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const ts = Date.now();

const HA = { Authorization: `Bearer ${generateToken(USER_A)}` };

let openId: string;
let doneId: string;
let archivedId: string;
let otherUsersId: string;
// Three entries in their own project, for the order the list comes back in.
let lateId: string;
let soonId: string;
let undatedId: string;

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: USER_A, email: `open-a-${ts}@test.local`, passwordHash: "x", fullName: "Open A", isEmailVerified: true },
      { id: USER_B, email: `open-b-${ts}@test.local`, passwordHash: "x", fullName: "Open B", isEmailVerified: true },
    ],
  });
  const [mine, theirs] = await Promise.all([
    prisma.project.create({ data: { userId: USER_A, name: "Thesis" } }),
    prisma.project.create({ data: { userId: USER_B, name: "Someone else's" } }),
  ]);

  const entry = (projectId: string, over: object = {}) =>
    prisma.logbookEntry.create({ data: { projectId, durationMinutes: 30, ...over } });

  [openId, doneId, archivedId, otherUsersId] = (
    await Promise.all([
      entry(mine.id),
      entry(mine.id, { status: "DONE", completedAt: new Date() }),
      entry(mine.id, { archivedAt: new Date() }),
      entry(theirs.id),
    ])
  ).map((e) => e.id);

  const day = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  };
  const ordering = await prisma.project.create({ data: { userId: USER_A, name: "Ordering" } });
  [lateId, soonId, undatedId] = (
    await Promise.all([
      entry(ordering.id, { dueDate: day(-1) }),
      entry(ordering.id, { dueDate: day(3) }),
      entry(ordering.id),
    ])
  ).map((e) => e.id);
});

afterAll(async () => {
  // Projects and entries go with their owners (ON DELETE CASCADE).
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
});

describe("GET /api/me/open-entries", () => {
  const idsOf = (body: { entries: { id: string }[] }) => body.entries.map((e) => e.id);

  it("lists the owner's open entries with their project's name", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);

    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(openId);
    expect(res.body.entries.find((e: { id: string }) => e.id === openId).projectName).toBe("Thesis");
  });

  it("leaves out finished entries", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(idsOf(res.body)).not.toContain(doneId);
  });

  it("leaves out archived entries, which are not work still to do", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(idsOf(res.body)).not.toContain(archivedId);
  });

  it("never includes another user's entries", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(idsOf(res.body)).not.toContain(otherUsersId);
  });

  it("requires sign-in", async () => {
    const res = await request(app).get("/api/me/open-entries");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/me/open-entries — paging", () => {
  it("returns a page and says where in the list it sits", async () => {
    const res = await request(app).get("/api/me/open-entries?limit=2&offset=0").set(HA);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.limit).toBe(2);
    expect(res.body.offset).toBe(0);
    // More open work exists than this page holds.
    expect(res.body.truncated).toBe(true);
  });

  it("brings different entries on the next page", async () => {
    const first = await request(app).get("/api/me/open-entries?limit=2&offset=0").set(HA);
    const second = await request(app).get("/api/me/open-entries?limit=2&offset=2").set(HA);

    const seen = first.body.entries.map((e: { id: string }) => e.id);
    for (const entry of second.body.entries) expect(seen).not.toContain(entry.id);
  });

  it("says the list is whole when the page holds everything", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);

    expect(res.body.truncated).toBe(false);
    expect(res.body.limit).toBe(200);
  });

  it("caps a request for more than it will serve", async () => {
    const res = await request(app).get("/api/me/open-entries?limit=10000").set(HA);

    expect(res.body.limit).toBe(500);
  });

  it("puts the soonest due date first, and undated work last", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    const ids: string[] = res.body.entries.map((e: { id: string }) => e.id);

    expect(ids.indexOf(lateId)).toBeLessThan(ids.indexOf(soonId));
    expect(ids.indexOf(soonId)).toBeLessThan(ids.indexOf(undatedId));
  });

  it("refuses a limit that is not a positive whole number", async () => {
    for (const limit of ["0", "-5", "abc", "1.5"]) {
      const res = await request(app).get(`/api/me/open-entries?limit=${limit}`).set(HA);
      expect(res.status).toBe(400);
    }
  });

  it("refuses an offset that is not a whole number of items", async () => {
    for (const offset of ["-1", "abc"]) {
      const res = await request(app).get(`/api/me/open-entries?offset=${offset}`).set(HA);
      expect(res.status).toBe(400);
    }
  });
});
