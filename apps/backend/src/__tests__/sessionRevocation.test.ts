import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../prisma.js";
import { generateToken, hashPassword } from "../utils/auth.js";
import { generateRawToken, hashToken } from "../utils/tokens.js";

// ── Fixture ──────────────────────────────────────────────────────────────
//
// These tests walk one account through the states that used to leave a token
// alive: signing in, signing out, and resetting the password. Each step reads
// the current version from the database rather than assuming it, because every
// revocation moves it and the order of the tests is what produces the state.

const ts = Date.now();
const EMAIL = `__revoke_${ts}@example.com`;
const PASSWORD = "Password1";

let userId: string;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const currentVersion = async (): Promise<number> => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  return user.tokenVersion;
};

/** A token that is valid right now, signed with the account's current version. */
const liveToken = async (): Promise<string> => generateToken(userId, await currentVersion());

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      fullName: "Session Revocation",
      isEmailVerified: true,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("Sessions can be revoked", () => {
  it("accepts a token whose version matches the account", async () => {
    const res = await request(app).get("/api/me").set(bearer(await liveToken()));

    expect(res.status).toBe(200);
  });

  it("logout answers 204 and kills the token that called it", async () => {
    const token = await liveToken();

    const out = await request(app).post("/api/auth/logout").set(bearer(token));
    expect(out.status).toBe(204);

    const after = await request(app).get("/api/me").set(bearer(token));
    expect(after.status).toBe(401);
    expect(after.body.error).toMatch(/sign in again|invalid or expired/i);
  });

  it("logout also kills every other session for the account", async () => {
    // Two devices signed in at the same version: the "phone" and the "laptop".
    const version = await currentVersion();
    const phone = generateToken(userId, version);
    const laptop = generateToken(userId, version);

    expect((await request(app).get("/api/me").set(bearer(phone))).status).toBe(200);

    await request(app).post("/api/auth/logout").set(bearer(phone)).expect(204);

    // The device that did not sign out is signed out anyway. That is the
    // trade this design makes; per-device revocation would need a denylist.
    expect((await request(app).get("/api/me").set(bearer(laptop))).status).toBe(401);
  });

  it("a login after a logout issues a token that works", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");

    const me = await request(app).get("/api/me").set(bearer(res.body.token));
    expect(me.status).toBe(200);
  });

  it("resetting the password withdraws the sessions that came before it", async () => {
    const before = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(before.status).toBe(200);
    const stolenToken = before.body.token;

    // Stand in for the emailed link: the route only ever sees the digest.
    const raw = generateRawToken();
    await prisma.passwordReset.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: raw, newPassword: "NewPassword1" });
    expect(reset.status).toBe(200);

    const withOld = await request(app).get("/api/me").set(bearer(stolenToken));
    expect(withOld.status).toBe(401);

    // The new password works, and the account is not left locked out.
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "NewPassword1" });
    expect(relogin.status).toBe(200);
  });
});
