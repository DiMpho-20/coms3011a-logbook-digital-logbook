import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// The student's profile card: GET /me and PATCH /me.
//
// The point of these fields living on the account rather than in localStorage
// is that they follow the student between browsers, so the tests that matter
// most here are the ones about what PATCH is allowed to touch — a profile form
// must never be able to reach the email address or the display name.

const ts = Date.now();
const USER_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
let H: Record<string, string>;
let OTHER: Record<string, string>;

/** A 1x1 PNG — small, valid, and shaped like what the browser uploads. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createUser(id: string, label: string) {
  await prisma.user.create({
    data: {
      id,
      email: `profile_${label}_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: `Profile ${label}`,
      isEmailVerified: true,
    },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

beforeAll(async () => {
  H = await createUser(USER_ID, "main");
  OTHER = await createUser(OTHER_ID, "other");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_ID] } } });
});

describe("GET /me", () => {
  it("requires sign-in", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns the account with the profile fields still empty", async () => {
    const res = await request(app).get("/api/me").set(H);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: USER_ID,
      email: `profile_main_${ts}@example.com`,
      fullName: "Profile main",
      bio: null,
      avatar: null,
      studentNumber: null,
      degree: null,
      yearOfStudy: null,
    });
    expect(typeof res.body.memberSince).toBe("string");
  });

  it("never returns the password hash or the 2FA secret", async () => {
    const res = await request(app).get("/api/me").set(H);
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("twoFactorSecret");
  });
});

describe("PATCH /me", () => {
  it("requires sign-in", async () => {
    const res = await request(app).patch("/api/me").send({ bio: "hello" });
    expect(res.status).toBe(401);
  });

  it("saves the fields and gives them back on the next read", async () => {
    const saved = await request(app).patch("/api/me").set(H).send({
      bio: "Third year, mostly labs.",
      degree: "BSc Computer Science",
      yearOfStudy: "3rd Year",
      studentNumber: "2512345",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      bio: "Third year, mostly labs.",
      degree: "BSc Computer Science",
      yearOfStudy: "3rd Year",
      studentNumber: "2512345",
    });

    const read = await request(app).get("/api/me").set(H);
    expect(read.body.bio).toBe("Third year, mostly labs.");
    expect(read.body.degree).toBe("BSc Computer Science");
  });

  it("leaves the fields it was not sent alone", async () => {
    await request(app).patch("/api/me").set(H).send({ yearOfStudy: "4th Year" });
    const read = await request(app).get("/api/me").set(H);
    // Only the year moved; the rest of the card survived.
    expect(read.body.yearOfStudy).toBe("4th Year");
    expect(read.body.degree).toBe("BSc Computer Science");
    expect(read.body.bio).toBe("Third year, mostly labs.");
  });

  it("trims what the student typed", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ degree: "  BA Law  " });
    expect(res.body.degree).toBe("BA Law");
  });

  it("clears a field when sent an empty string", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ studentNumber: "" });
    expect(res.body.studentNumber).toBeNull();
  });

  it("clears a field when sent null", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ bio: null });
    expect(res.body.bio).toBeNull();
  });

  it("accepts an image data URL as the avatar", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ avatar: PIXEL });
    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(PIXEL);
  });

  it("removes the avatar when sent null", async () => {
    await request(app).patch("/api/me").set(H).send({ avatar: PIXEL });
    const res = await request(app).patch("/api/me").set(H).send({ avatar: null });
    expect(res.body.avatar).toBeNull();
  });
});

describe("PATCH /me — what it refuses", () => {
  it("rejects a bio longer than 280 characters", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ bio: "x".repeat(281) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/280/);
  });

  it("rejects an avatar that is not an image data URL", async () => {
    const res = await request(app)
      .patch("/api/me")
      .set(H)
      .send({ avatar: "https://example.com/photo.png" });
    expect(res.status).toBe(400);
  });

  it("rejects a script smuggled in as a data URL", async () => {
    const res = await request(app)
      .patch("/api/me")
      .set(H)
      .send({ avatar: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" });
    expect(res.status).toBe(400);
  });

  it("rejects an avatar over the size cap", async () => {
    const huge = `data:image/png;base64,${"A".repeat(520 * 1024)}`;
    const res = await request(app).patch("/api/me").set(H).send({ avatar: huge });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });

  it("rejects a student number longer than the column", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ studentNumber: "1".repeat(33) });
    expect(res.status).toBe(400);
  });

  it("cannot change the email address", async () => {
    const before = await request(app).get("/api/me").set(H);
    const res = await request(app)
      .patch("/api/me")
      .set(H)
      .send({ email: "attacker@example.com", bio: "still me" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(before.body.email);
  });

  it("can change the display name, which the student owns", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ fullName: "Renamed Main" });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Renamed Main");

    const read = await request(app).get("/api/me").set(H);
    expect(read.body.fullName).toBe("Renamed Main");
    // Put it back so the later ownership tests read what they expect.
    await request(app).patch("/api/me").set(H).send({ fullName: "Profile main" });
  });

  it("refuses to blank the display name", async () => {
    const res = await request(app).patch("/api/me").set(H).send({ fullName: "   " });
    expect(res.status).toBe(400);
    const read = await request(app).get("/api/me").set(H);
    expect(read.body.fullName).toBe("Profile main");
  });

  it("cannot change the password", async () => {
    await request(app).patch("/api/me").set(H).send({ passwordHash: "not-a-hash" });
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user?.passwordHash).not.toBe("not-a-hash");
  });

  it("cannot enable two-factor authentication", async () => {
    await request(app).patch("/api/me").set(H).send({ isTwoFactorEnabled: true });
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user?.isTwoFactorEnabled).toBe(false);
  });
});

describe("one student's profile is their own", () => {
  it("never shows another account's details", async () => {
    await request(app).patch("/api/me").set(H).send({ bio: "main's bio" });
    await request(app).patch("/api/me").set(OTHER).send({ bio: "other's bio" });

    const mine = await request(app).get("/api/me").set(H);
    const theirs = await request(app).get("/api/me").set(OTHER);

    expect(mine.body.bio).toBe("main's bio");
    expect(theirs.body.bio).toBe("other's bio");
    expect(mine.body.id).not.toBe(theirs.body.id);
  });

  it("writes only to the token's own account", async () => {
    await request(app).patch("/api/me").set(OTHER).send({ degree: "BEng" });
    const mine = await request(app).get("/api/me").set(H);
    expect(mine.body.degree).toBe("BA Law");
  });
});
