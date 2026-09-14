import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { generateSync } from "otplib";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Shared constants ─────────────────────────────────────────────────────

const ts = Date.now();
const TEST_PASSWORD = "Password123";

const REGISTER_EMAIL = `auth_reg_${ts}@example.com`;
const LOGIN_USER_ID = crypto.randomUUID();
const LOGIN_EMAIL = `auth_login_${ts}@example.com`;
const UNVERIFIED_USER_ID = crypto.randomUUID();
const UNVERIFIED_EMAIL = `auth_unverified_${ts}@example.com`;
const TFA_USER_ID = crypto.randomUUID();
const TFA_EMAIL = `auth_2fa_${ts}@example.com`;

let registeredUserId: string | null = null;
let tfaToken: Record<string, string>;

beforeAll(async () => {
  // Two Prisma-created users with known password hashes:
  //   LOGIN_USER — email verified, used for password/login tests
  //   TFA_USER   — email verified, used for the full 2FA cycle
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.createMany({
    data: [
      {
        id: LOGIN_USER_ID,
        email: LOGIN_EMAIL,
        passwordHash,
        fullName: "Login Test User",
        isEmailVerified: true,
      },
      {
        id: TFA_USER_ID,
        email: TFA_EMAIL,
        passwordHash,
        fullName: "2FA Test User",
        isEmailVerified: true,
      },
    ],
  });

  tfaToken = { Authorization: `Bearer ${generateToken(TFA_USER_ID)}` };
});

afterAll(async () => {
  const ids = [
    registeredUserId,
    LOGIN_USER_ID,
    UNVERIFIED_USER_ID,
    TFA_USER_ID,
  ].filter(Boolean) as string[];
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
});

// ── Registration (US00.1) ────────────────────────────────────────────────

describe("Registration", () => {
  it("POST /auth/register creates a user → 201", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Register Test",
      email: REGISTER_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(REGISTER_EMAIL);
    registeredUserId = res.body.user.id;
  });

  it("POST /auth/register rejects duplicate email → 409", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Register Test",
      email: REGISTER_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("POST /auth/register rejects a weak password → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Weak Password User",
      email: `auth_weak_${ts}@example.com`,
      password: "alllowercase1",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();
  });

  it("POST /auth/register rejects an invalid email → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Bad Email User",
      email: "not-an-email",
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();
  });
});

// ── Login (US00.2) ───────────────────────────────────────────────────────

describe("Login", () => {
  it("POST /auth/login returns a JWT for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: LOGIN_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(LOGIN_EMAIL);
  });

  it("POST /auth/login rejects a wrong password → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: LOGIN_EMAIL,
      password: "WrongPassword1",
    });

    expect(res.status).toBe(401);
    // Must not reveal which part failed
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("POST /auth/login rejects an unknown email → 401 (same message)", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: `nobody_${ts}@example.com`,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("POST /auth/login blocks unverified accounts → 403", async () => {
    await prisma.user.create({
      data: {
        id: UNVERIFIED_USER_ID,
        email: UNVERIFIED_EMAIL,
        passwordHash: await hashPassword(TEST_PASSWORD),
        fullName: "Unverified User",
        isEmailVerified: false,
      },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: UNVERIFIED_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("verify your email");
  });
});

// ── Route Protection ─────────────────────────────────────────────────────

describe("Auth middleware", () => {
  it("rejects requests without a token → 401", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Token missing");
  });

  it("rejects requests with an invalid token → 401", async () => {
    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid or expired token");
  });
});

// ── Two-Factor Authentication ────────────────────────────────────────────

describe("2FA lifecycle", () => {
  let secret: string;

  it("reports 2FA disabled initially", async () => {
    const res = await request(app).get("/api/auth/2fa/status").set(tfaToken);
    expect(res.status).toBe(200);
    expect(res.body.isTwoFactorEnabled).toBe(false);
  });

  it("POST /2fa/setup returns a secret and QR code", async () => {
    const res = await request(app).post("/api/auth/2fa/setup").set(tfaToken);

    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    secret = res.body.secret;
  });

  it("POST /2fa/verify-setup rejects an incorrect code → 400", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/verify-setup")
      .set(tfaToken)
      .send({ token: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid code");
  });

  it("POST /2fa/verify-setup accepts a valid code and enables 2FA", async () => {
    const code = generateSync({ secret });
    const res = await request(app)
      .post("/api/auth/2fa/verify-setup")
      .set(tfaToken)
      .send({ token: code });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("enabled");
  });

  it("reports 2FA enabled after verification", async () => {
    const res = await request(app).get("/api/auth/2fa/status").set(tfaToken);
    expect(res.status).toBe(200);
    expect(res.body.isTwoFactorEnabled).toBe(true);
  });

  it("POST /2fa/setup rejects when already enabled → 400", async () => {
    const res = await request(app).post("/api/auth/2fa/setup").set(tfaToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already enabled");
  });

  it("login with 2FA enabled returns requiresTwoFactor and no token", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: TFA_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
    expect(res.body.email).toBe(TFA_EMAIL);
    expect(res.body.token).toBeUndefined();
  });

  it("POST /login/2fa rejects an invalid code → 401", async () => {
    const res = await request(app).post("/api/auth/login/2fa").send({
      email: TFA_EMAIL,
      token: "123123",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid authentication code");
  });

  it("POST /login/2fa accepts a valid code and issues a JWT", async () => {
    const code = generateSync({ secret });
    const res = await request(app).post("/api/auth/login/2fa").send({
      email: TFA_EMAIL,
      token: code,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(TFA_EMAIL);
  });

  it("POST /login/2fa rejects a malformed code → 400", async () => {
    const res = await request(app).post("/api/auth/login/2fa").send({
      email: TFA_EMAIL,
      token: "12345", // not 6 digits
    });

    expect(res.status).toBe(400);
  });

  it("POST /2fa/disable rejects a wrong password → 401", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/disable")
      .set(tfaToken)
      .send({ password: "WrongPassword1" });

    expect(res.status).toBe(401);
  });

  it("POST /2fa/disable with correct password disables 2FA", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/disable")
      .set(tfaToken)
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("disabled");
  });

  it("login works normally again after 2FA is disabled", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: TFA_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBeUndefined();
    expect(res.body.token).toBeTruthy();
  });
});

// ── Password Reset (US00.3) ──────────────────────────────────────────────

describe("Password reset", () => {
  it("POST /forgot-password returns the same message for unknown emails", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `nobody_reset_${ts}@example.com` });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If account exists");
  });

  it("POST /forgot-password returns the same message for real emails", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: LOGIN_EMAIL });

    expect(res.status).toBe(200);
    // Identical response — no account enumeration
    expect(res.body.message).toContain("If account exists");
  });

  it("POST /reset-password rejects an invalid token → 400", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: crypto.randomBytes(32).toString("hex"),
      newPassword: TEST_PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid or expired");
  });

  it("resets the password end-to-end with a valid token", async () => {
    // Create a reset token directly (bypassing email delivery)
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordReset.create({
      data: {
        userId: LOGIN_USER_ID,
        tokenHash: token,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const newPassword = "NewPassword456";
    const res = await request(app).post("/api/auth/reset-password").send({
      token,
      newPassword,
    });

    expect(res.status).toBe(200);

    // Old password no longer works; new one does
    const oldLogin = await request(app).post("/api/auth/login").send({
      email: LOGIN_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: LOGIN_EMAIL,
      password: newPassword,
    });
    expect(newLogin.status).toBe(200);

    // Reset tokens were consumed (single-use)
    const remaining = await prisma.passwordReset.count({
      where: { userId: LOGIN_USER_ID },
    });
    expect(remaining).toBe(0);
  });
});

// ── Account Deletion (US00.4) ────────────────────────────────────────────

describe("Account deletion", () => {
  it("DELETE /auth/account rejects a wrong password → 401", async () => {
    const res = await request(app)
      .delete("/api/auth/account")
      .set(tfaToken)
      .send({ confirmPassword: "WrongPassword1" });

    expect(res.status).toBe(401);
  });

  it("DELETE /auth/account with correct password erases the account", async () => {
    const res = await request(app)
      .delete("/api/auth/account")
      .set(tfaToken)
      .send({ confirmPassword: TEST_PASSWORD });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: TFA_USER_ID } });
    expect(user).toBeNull();
  });
});
