import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { createRateLimiter, rateLimitingDisabled } from "../middleware/rateLimit.middleware.js";

// ── BUG-003 regression suite ─────────────────────────────────────────────
// Rate limiting is off under NODE_ENV=test so that the auth suite, which
// registers and signs in far more often than any window allows, is not
// throttled for reasons unrelated to what it tests. This suite turns it back
// on with an explicit RATE_LIMIT_DISABLED=false and exercises a throwaway app
// rather than the real auth routes.

const ORIGINAL = process.env.RATE_LIMIT_DISABLED;

function appWithLimit(limit: number) {
  const app = express();
  app.use(express.json());
  app.post(
    "/thing",
    createRateLimiter({ windowMs: 60_000, limit, message: "Too many attempts. Please wait and try again." }),
    (_req, res) => res.status(200).json({ ok: true })
  );
  return app;
}

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = "false";
});

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = ORIGINAL;
});

describe("BUG-003: the limiter throttles once the window is spent", () => {
  it("allows requests up to the limit", async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/thing").send({});
      expect(res.status, `request ${i + 1} should pass`).toBe(200);
    }
  });

  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    const app = appWithLimit(2);
    await request(app).post("/thing").send({});
    await request(app).post("/thing").send({});

    const blocked = await request(app).post("/thing").send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatch(/too many/i);
  });

  it("sends both the legacy and the standard header families", async () => {
    const app = appWithLimit(5);
    const res = await request(app).post("/thing").send({});

    // FEAT-007 asks for these by name.
    expect(res.headers["x-ratelimit-limit"]).toBe("5");
    expect(res.headers["x-ratelimit-remaining"]).toBe("4");
    // And the draft standard's unprefixed form.
    expect(res.headers["ratelimit-limit"] ?? res.headers["ratelimit"]).toBeDefined();
  });

  it("counts down the remaining allowance", async () => {
    const app = appWithLimit(3);
    const first = await request(app).post("/thing").send({});
    const second = await request(app).post("/thing").send({});

    expect(Number(first.headers["x-ratelimit-remaining"])).toBe(2);
    expect(Number(second.headers["x-ratelimit-remaining"])).toBe(1);
  });
});

describe("BUG-003: the switch", () => {
  it("is off by default under test, so the auth suite is not throttled", () => {
    const explicit = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    try {
      expect(process.env.NODE_ENV).toBe("test");
      expect(rateLimitingDisabled()).toBe(true);
    } finally {
      if (explicit !== undefined) process.env.RATE_LIMIT_DISABLED = explicit;
    }
  });

  it("lets requests through unthrottled when disabled", async () => {
    const explicit = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = "true";
    try {
      const app = appWithLimit(1);
      await request(app).post("/thing").send({});
      const second = await request(app).post("/thing").send({});
      expect(second.status).toBe(200);
    } finally {
      if (explicit !== undefined) process.env.RATE_LIMIT_DISABLED = explicit;
    }
  });
});
