import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { generateOAuthState, verifyOAuthState, verifyToken, generateToken } from "../utils/auth.js";
import { encryptGoogleToken, decryptGoogleToken } from "../utils/googleTokens.js";

// ── Google Calendar OAuth regression suite ───────────────────────────────
// The callback used to be unauthenticated with no state, stored tokens on a
// single module-wide OAuth client shared by every user, and never wrote a
// connection row. Tokens are now bound to the initiating user via signed
// state and stored encrypted per user.

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
] as const;
const original: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("OAuth state", () => {
  it("round-trips the initiating user", () => {
    expect(verifyOAuthState(generateOAuthState("user-1"))).toBe("user-1");
  });

  it("rejects a session token used as state", () => {
    expect(verifyOAuthState(generateToken("user-1"))).toBeNull();
  });

  it("rejects state signed with another key", () => {
    const forged = jwt.sign({ userId: "user-1", purpose: "oauth-state" }, "attacker-key");
    expect(verifyOAuthState(forged)).toBeNull();
  });

  it("cannot be used as a session token", () => {
    expect(verifyToken(generateOAuthState("user-1"))).toBeNull();
  });
});

describe("token encryption", () => {
  it("round-trips and does not store plaintext", () => {
    const stored = encryptGoogleToken("ya29.secret-access-token");
    expect(stored).not.toContain("secret-access-token");
    expect(decryptGoogleToken(stored)).toBe("ya29.secret-access-token");
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptGoogleToken("same")).not.toBe(encryptGoogleToken("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptGoogleToken("token").split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptGoogleToken([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });
});

describe("GET /api/google-calendar/callback", () => {
  it("sends the user back to the Calendar page when they decline consent", async () => {
    const res = await request(app).get("/api/google-calendar/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/calendar\?calendar=denied$/);
  });

  it("rejects a callback without state", async () => {
    const res = await request(app).get("/api/google-calendar/callback?code=abc");
    expect(res.status).toBe(400);
  });

  it("rejects a callback with forged state", async () => {
    const forged = jwt.sign({ userId: "victim", purpose: "oauth-state" }, "attacker-key");
    const res = await request(app).get(`/api/google-calendar/callback?code=abc&state=${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejects a session token passed as state", async () => {
    const res = await request(app).get(
      `/api/google-calendar/callback?code=abc&state=${generateToken("victim")}`,
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/google-calendar/connect", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/google-calendar/connect");
    expect(res.status).toBe(401);
  });

  it("embeds state bound to the caller in the auth URL", async () => {
    const res = await request(app)
      .get("/api/google-calendar/connect")
      .set({ Authorization: `Bearer ${generateToken("user-42")}` });
    expect(res.status).toBe(200);
    const state = new URL(res.body.url).searchParams.get("state");
    expect(state && verifyOAuthState(state)).toBe("user-42");
  });
});
