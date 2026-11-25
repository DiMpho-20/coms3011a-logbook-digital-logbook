import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import app from "../app.js";
import { errorHandler, notFoundHandler } from "../middleware/error.middleware.js";
import { readCorsAllowlist } from "../middleware/cors.middleware.js";

// ── Unmatched routes ─────────────────────────────────────────────────────

describe("Unmatched routes", () => {
  it("answers an unknown /api path with JSON rather than Express's HTML page", async () => {
    const res = await request(app).get("/api/no-such-endpoint");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBe("Not found");
  });

  it("keeps the retired /api/db-check retired", async () => {
    const res = await request(app).get("/api/db-check");

    expect(res.status).toBe(404);
    // The endpoint used to volunteer the database vendor and current time.
    expect(JSON.stringify(res.body)).not.toMatch(/PostgreSQL|Neon|time/);
  });
});

// ── Security headers ─────────────────────────────────────────────────────

describe("Security headers", () => {
  it("marks responses nosniff, denies framing and drops the referrer", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"] ?? res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBeDefined();
  });
});

// ── Global error handler ─────────────────────────────────────────────────

// A separate app, because the real one has no route that throws on purpose.
const probeApp = (): express.Express => {
  const probe = express();

  probe.get("/boom", () => {
    throw new Error("connect ECONNREFUSED postgres://logbook:hunter2@db.internal/logbook");
  });

  probe.get("/teapot", () => {
    throw Object.assign(new Error("Short and stout"), { status: 418 });
  });

  probe.use(notFoundHandler);
  probe.use(errorHandler);
  return probe;
};

describe("Global error handler", () => {
  it("answers a thrown error with 500 and a message that carries nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(probeApp()).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(JSON.stringify(res.body)).not.toContain("db.internal");
    // The detail is not lost, it moves: the log still has it.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("passes a 4xx message through, because that one is the caller's to fix", async () => {
    const res = await request(probeApp()).get("/teapot");

    expect(res.status).toBe(418);
    expect(res.body.error).toBe("Short and stout");
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────

describe("CORS allowlist", () => {
  it("grants the Vite dev origin outside production", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("refuses a pages.dev host it was not told about", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://someone-else.pages.dev");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("grants a configured origin list and nothing else", () => {
    const allowlist = readCorsAllowlist({
      NODE_ENV: "production",
      CORS_ORIGINS: "https://logbook.example, https://staging.example",
    });

    expect(allowlist.origins).toEqual(["https://logbook.example", "https://staging.example"]);
    expect(allowlist.origins).not.toContain("http://localhost:5173");
  });

  it("grants nothing in production when nothing is configured", () => {
    const allowlist = readCorsAllowlist({ NODE_ENV: "production" });

    expect(allowlist.origins).toEqual([]);
    expect(allowlist.pattern).toBeUndefined();
  });

  it("accepts an opt-in pattern for hosts that cannot be listed in advance", () => {
    const allowlist = readCorsAllowlist({
      NODE_ENV: "production",
      CORS_ORIGIN_PATTERN: "^https://[a-z0-9]+\\.logbook\\.pages\\.dev$",
    });

    expect(allowlist.pattern?.test("https://abc123.logbook.pages.dev")).toBe(true);
    expect(allowlist.pattern?.test("https://someone-else.pages.dev")).toBe(false);
  });

  it("ignores an invalid pattern instead of refusing to boot", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const allowlist = readCorsAllowlist({ NODE_ENV: "production", CORS_ORIGIN_PATTERN: "([unclosed" });

    expect(allowlist.pattern).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
