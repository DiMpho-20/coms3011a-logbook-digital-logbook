import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// US19 — Arrange and persist the dashboard layout.

const ts = Date.now();
const USER_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
let H: Record<string, string>;
let OTHER: Record<string, string>;

async function createUser(id: string, label: string) {
  await prisma.user.create({
    data: {
      id,
      email: `dashboard_${label}_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: `Dashboard ${label}`,
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
  // Cascades to the saved layouts.
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_ID] } } });
});

const statPanel = `stat:${crypto.randomUUID()}:${crypto.randomUUID()}`;

describe("dashboard layout", () => {
  it("has no saved layout at first", async () => {
    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.status).toBe(200);
    expect(res.body.panels).toBeNull();
  });

  it("requires sign-in", async () => {
    const res = await request(app).get("/api/dashboard/layout");
    expect(res.status).toBe(401);
  });

  it("AT2/AT3 — stores the arrangement and gives it back in the same order", async () => {
    const panels = ["recent-entries", statPanel, "activity"];
    const saved = await request(app).put("/api/dashboard/layout").set(H).send({ panels });
    expect(saved.status).toBe(200);
    expect(saved.body.panels).toEqual(panels);

    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.body.panels).toEqual(panels);
  });

  it("AT4 — a new arrangement replaces the previous one", async () => {
    await request(app).put("/api/dashboard/layout").set(H).send({ panels: ["tags"] });
    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.body.panels).toEqual(["tags"]);
  });

  it("keeps an empty dashboard as a choice of its own", async () => {
    await request(app).put("/api/dashboard/layout").set(H).send({ panels: [] });
    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.body.panels).toEqual([]);
  });

  it("keeps each student's layout to themselves", async () => {
    await request(app).put("/api/dashboard/layout").set(H).send({ panels: ["activity"] });
    const res = await request(app).get("/api/dashboard/layout").set(OTHER);
    expect(res.body.panels).toBeNull();
  });

  it("rejects malformed layouts", async () => {
    for (const panels of [["activity", "activity"], ["<script>"], ["stat:not-a-uuid:x"], "activity"]) {
      const res = await request(app).put("/api/dashboard/layout").set(H).send({ panels });
      expect(res.status).toBe(400);
    }
    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.body.panels).toEqual(["activity"]);
  });

  it("goes back to the default dashboard when reset", async () => {
    const del = await request(app).delete("/api/dashboard/layout").set(H);
    expect(del.status).toBe(204);
    const res = await request(app).get("/api/dashboard/layout").set(H);
    expect(res.body.panels).toBeNull();
  });
});
