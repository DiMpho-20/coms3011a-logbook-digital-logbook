import { describe, it, expect, afterEach, vi } from "vitest";

// ── BUG-002 regression suite ─────────────────────────────────────────────
// JWT_SECRET used to fall back to the literal "your-fallback-secret-key".
// Any deployment that forgot the variable signed every session token with a
// key published in this repository, so anyone who had read the source could
// forge a token for any account.
//
// These tests import the module fresh each time, because the secret is read
// once at load — deliberately, so that tokens signed earlier in a process
// stay verifiable for its lifetime.

const ORIGINAL_ENV = process.env.JWT_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_ENV;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.resetModules();
});

describe("BUG-002: JWT secret configuration", () => {
  it("refuses to start in production without JWT_SECRET", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    vi.resetModules();

    await expect(import("../utils/auth.js")).rejects.toThrow(/JWT_SECRET is not set/);
  });

  it("starts in production when JWT_SECRET is provided", async () => {
    process.env.JWT_SECRET = "a-real-production-secret";
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const mod = await import("../utils/auth.js");
    const token = mod.generateToken("user-1");
    expect(mod.verifyToken(token)).toEqual(expect.objectContaining({ userId: "user-1" }));
  });

  it("starts outside production without JWT_SECRET, and issues usable tokens", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    vi.resetModules();

    const mod = await import("../utils/auth.js");
    const token = mod.generateToken("user-2");
    expect(mod.verifyToken(token)).toEqual(expect.objectContaining({ userId: "user-2" }));
  });

  it("does not sign with the removed hardcoded fallback", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    vi.resetModules();

    const mod = await import("../utils/auth.js");
    const token = mod.generateToken("user-3");

    // The old default. A token signed with the generated secret must not
    // verify against it.
    const jwt = (await import("jsonwebtoken")).default;
    expect(() => jwt.verify(token, "your-fallback-secret-key")).toThrow();
  });

  it("gives two processes different generated secrets", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const first = await import("../utils/auth.js");
    const tokenFromFirst = first.generateToken("user-4");

    vi.resetModules();
    const second = await import("../utils/auth.js");

    // A fresh load invents a fresh secret, so the earlier token no longer
    // verifies — the documented cost of not setting JWT_SECRET.
    expect(second.verifyToken(tokenFromFirst)).toBeNull();
  });
});
