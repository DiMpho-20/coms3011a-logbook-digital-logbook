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
});

afterAll(async () => {
  // Projects and entries go with their owners (ON DELETE CASCADE).
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
});

describe("GET /api/me/open-entries", () => {
  it("lists the owner's open entries with their project's name", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);

    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id);
    expect(ids).toContain(openId);
    expect(res.body.find((e: { id: string }) => e.id === openId).projectName).toBe("Thesis");
  });

  it("leaves out finished entries", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(res.body.map((e: { id: string }) => e.id)).not.toContain(doneId);
  });

  it("leaves out archived entries, which are not work still to do", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(res.body.map((e: { id: string }) => e.id)).not.toContain(archivedId);
  });

  it("never includes another user's entries", async () => {
    const res = await request(app).get("/api/me/open-entries").set(HA);
    expect(res.body.map((e: { id: string }) => e.id)).not.toContain(otherUsersId);
  });

  it("requires sign-in", async () => {
    const res = await request(app).get("/api/me/open-entries");
    expect(res.status).toBe(401);
  });
});
