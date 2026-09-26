import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { generateSecret, generateSync } from "otplib";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken, generateOAuthState } from "../utils/auth.js";
import { isEncryptedSecret, decryptTwoFactorSecret } from "../utils/twoFactorSecret.js";

// End-to-end cover for the three 2FA defects fixed together:
//   BUG-004  TOTP secrets were stored in plaintext
//   BUG-005  losing the authenticator device meant losing the account
//   BUG-006  /login/2fa was not tied to the password step that preceded it

const ts = Date.now();
const TEST_PASSWORD = "Password123";

const ENROL_ID = crypto.randomUUID();
const ENROL_EMAIL = `tfa_enrol_${ts}@example.com`;
const LEGACY_ID = crypto.randomUUID();
const LEGACY_EMAIL = `tfa_legacy_${ts}@example.com`;

// A secret stored the old way: bare base32, exactly as rows written before the
// fix still look in production.
const LEGACY_SECRET = generateSecret();

let enrolAuth: Record<string, string>;
let enrolSecret = "";
let recoveryCodes: string[] = [];

/** Complete the password step and return the hand-off token /login/2fa requires. */
async function passwordStep(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.requiresTwoFactor).toBe(true);
  return res.body.twoFactorToken;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.createMany({
    data: [
      {
        id: ENROL_ID,
        email: ENROL_EMAIL,
        passwordHash,
        fullName: "2FA Enrolment User",
        isEmailVerified: true,
      },
      {
        id: LEGACY_ID,
        email: LEGACY_EMAIL,
        passwordHash,
        fullName: "Legacy Plaintext User",
        isEmailVerified: true,
        // Written straight to the column, unencrypted, on purpose.
        twoFactorSecret: LEGACY_SECRET,
        isTwoFactorEnabled: true,
      },
    ],
  });

  enrolAuth = { Authorization: `Bearer ${generateToken(ENROL_ID)}` };
});

afterAll(async () => {
  // Recovery codes cascade with the user.
  await prisma.user.deleteMany({ where: { id: { in: [ENROL_ID, LEGACY_ID] } } });
});

describe("BUG-004 — TOTP secrets are encrypted at rest", () => {
  it("enrols and stores an envelope rather than the secret", async () => {
    const setup = await request(app).post("/api/auth/2fa/setup").set(enrolAuth);
    expect(setup.status).toBe(200);

    // The response still carries the secret — the user needs it for their
    // authenticator app. What must not be plaintext is the stored copy.
    enrolSecret = setup.body.secret;
    expect(enrolSecret).toBeTruthy();

    const row = await prisma.user.findUnique({
      where: { id: ENROL_ID },
      select: { twoFactorSecret: true },
    });

    expect(row?.twoFactorSecret).toBeTruthy();
    expect(row?.twoFactorSecret).not.toBe(enrolSecret);
    expect(isEncryptedSecret(row!.twoFactorSecret!)).toBe(true);
    expect(decryptTwoFactorSecret(row!.twoFactorSecret!)).toBe(enrolSecret);
  });

  it("verifies a code against the encrypted secret", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/verify-setup")
      .set(enrolAuth)
      .send({ token: generateSync({ secret: enrolSecret }) });

    expect(res.status).toBe(200);
    recoveryCodes = res.body.recoveryCodes;
  });

  it("still accepts a legacy plaintext secret, and re-encrypts it on use", async () => {
    // The migration path that matters: nobody is locked out, and the plaintext
    // row rewrites itself the first time its owner signs in.
    const before = await prisma.user.findUnique({
      where: { id: LEGACY_ID },
      select: { twoFactorSecret: true },
    });
    expect(isEncryptedSecret(before!.twoFactorSecret!)).toBe(false);

    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(LEGACY_EMAIL),
        code: generateSync({ secret: LEGACY_SECRET }),
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    const after = await prisma.user.findUnique({
      where: { id: LEGACY_ID },
      select: { twoFactorSecret: true },
    });
    expect(isEncryptedSecret(after!.twoFactorSecret!)).toBe(true);
    expect(decryptTwoFactorSecret(after!.twoFactorSecret!)).toBe(LEGACY_SECRET);
  });
});

describe("BUG-006 — the second login step is tied to the first", () => {
  it("refuses a request with no hand-off token", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({ code: generateSync({ secret: enrolSecret }) });

    expect(res.status).toBe(400);
  });

  it("refuses the old contract, where an email address stood in for proof", async () => {
    // This is the defect itself: knowing the address and holding a code used to
    // be enough, which made the second factor a replacement for the password.
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({ email: ENROL_EMAIL, token: generateSync({ secret: enrolSecret }) });

    expect(res.status).toBe(400);
  });

  it("refuses a session token used in place of the hand-off token", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: generateToken(ENROL_ID),
        code: generateSync({ secret: enrolSecret }),
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("refuses a token minted for a different purpose", async () => {
    // Purpose scoping has to cut both ways, or OAuth state would become a way in.
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: generateOAuthState(ENROL_ID),
        code: generateSync({ secret: enrolSecret }),
      });

    expect(res.status).toBe(401);
  });

  it("refuses a hand-off token that has been tampered with", async () => {
    const token = await passwordStep(ENROL_EMAIL);
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: token.slice(0, -2) + "xy",
        code: generateSync({ secret: enrolSecret }),
      });

    expect(res.status).toBe(401);
  });

  it("completes the login when the hand-off token came from the password step", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: generateSync({ secret: enrolSecret }),
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(ENROL_EMAIL);
  });

  it("does not accept the hand-off token as a session token", async () => {
    // verifyToken rejects anything carrying a purpose claim; this proves the
    // short-lived credential cannot be escalated into a full session.
    const pending = await passwordStep(ENROL_EMAIL);
    const res = await request(app)
      .get("/api/auth/2fa/status")
      .set({ Authorization: `Bearer ${pending}` });

    expect(res.status).toBe(401);
  });
});

describe("BUG-005 — recovery codes", () => {
  it("issued a full set when 2FA was enabled", () => {
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
  });

  it("stores digests, not the codes themselves", async () => {
    const rows = await prisma.twoFactorRecoveryCode.findMany({
      where: { userId: ENROL_ID },
      select: { codeHash: true },
    });

    expect(rows).toHaveLength(10);
    const stored = rows.map((row: { codeHash: string }) => row.codeHash);
    for (const code of recoveryCodes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace("-", ""));
    }
  });

  it("reports how many are left", async () => {
    const res = await request(app).get("/api/auth/2fa/status").set(enrolAuth);
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodesRemaining).toBe(10);
  });

  it("signs in with a recovery code, whatever the formatting", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        // Lowercase, space instead of a hyphen: how someone actually types it.
        code: recoveryCodes[0].replace("-", " ").toLowerCase(),
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usedRecoveryCode).toBe(true);
    expect(res.body.recoveryCodesRemaining).toBe(9);
  });

  it("refuses the same code a second time", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: recoveryCodes[0],
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid authentication code");
  });

  it("refuses a well-formed code that was never issued", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: "ZZZZZ-ZZZZZ",
      });

    expect(res.status).toBe(401);
  });

  it("still accepts the authenticator app after a recovery code was spent", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: generateSync({ secret: enrolSecret }),
      });

    expect(res.status).toBe(200);
    expect(res.body.usedRecoveryCode).toBe(false);
  });

  it("refuses to regenerate without the right password", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/recovery-codes")
      .set(enrolAuth)
      .send({ password: "WrongPassword1" });

    expect(res.status).toBe(401);
  });

  it("regenerates a fresh set and invalidates the old one", async () => {
    const previous = recoveryCodes;
    const res = await request(app)
      .post("/api/auth/2fa/recovery-codes")
      .set(enrolAuth)
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(res.body.recoveryCodes).not.toEqual(previous);
    recoveryCodes = res.body.recoveryCodes;

    // An unspent code from the previous set must no longer work.
    const stale = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: previous[5],
      });

    expect(stale.status).toBe(401);
  });

  it("accepts a code from the regenerated set", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        twoFactorToken: await passwordStep(ENROL_EMAIL),
        code: recoveryCodes[3],
      });

    expect(res.status).toBe(200);
    expect(res.body.usedRecoveryCode).toBe(true);
  });

  it("discards the codes when 2FA is switched off", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/disable")
      .set(enrolAuth)
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    // Leaving them behind would let a stale code unlock a later, unrelated setup.
    const remaining = await prisma.twoFactorRecoveryCode.count({
      where: { userId: ENROL_ID },
    });
    expect(remaining).toBe(0);
  });
});
