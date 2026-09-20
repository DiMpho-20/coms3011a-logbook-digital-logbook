import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Shared constants ─────────────────────────────────────────────────────

const USER_ID = crypto.randomUUID();
const ts = Date.now();
const TEST_EMAIL = `tags_${ts}@example.com`;
let H: Record<string, string>;

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: TEST_EMAIL,
      passwordHash: await hashPassword("Password123"),
      fullName: "Tags Test User",
      isEmailVerified: true,
    },
  });
  H = { Authorization: `Bearer ${generateToken(USER_ID)}` };
});

afterAll(async () => {
  // Cascades to projects, entries, tags, and the join rows.
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
});

// ── Project tags ──────────────────────────────────────────────────────────

describe("Project tags", () => {
  it("creates a project with tags", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_proj_${ts}`, tags: ["coursework", "urgent"] });

    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(["coursework", "urgent"]);
  });

  it("lists tags on GET /projects and GET /projects/:id", async () => {
    const listRes = await request(app).get("/api/projects").set(H);
    const created = listRes.body.find((p: any) => p.name === `__tags_proj_${ts}`);
    expect(created.tags).toEqual(["coursework", "urgent"]);

    const singleRes = await request(app).get(`/api/projects/${created.id}`).set(H);
    expect(singleRes.body.tags).toEqual(["coursework", "urgent"]);
  });

  it("replaces the tag set on update, and reuses an existing tag by name", async () => {
    const createRes = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_proj2_${ts}`, tags: ["coursework"] });
    const projectId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(H)
      .send({ tags: ["urgent", "reading"] });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tags).toEqual(["reading", "urgent"]);

    // "urgent" already exists from the earlier test — should be reused, not duplicated.
    const tagRows = await prisma.tag.findMany({ where: { userId: USER_ID, name: "urgent" } });
    expect(tagRows).toHaveLength(1);
  });

  it("clears all tags when updated with an empty array", async () => {
    const createRes = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_proj3_${ts}`, tags: ["temp"] });
    const projectId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(H)
      .send({ tags: [] });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tags).toEqual([]);
  });

  it("leaves tags untouched when the field is omitted from an update", async () => {
    const createRes = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_proj4_${ts}`, tags: ["keep-me"] });
    const projectId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(H)
      .send({ description: "no tags field here" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tags).toEqual(["keep-me"]);
  });

  it("normalizes and de-duplicates tag names, dropping empties", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_proj5_${ts}`, tags: ["  Focus  ", "focus", "", "   "] });

    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(["Focus"]);
  });
});

// ── Entry tags ────────────────────────────────────────────────────────────

describe("Entry tags", () => {
  let projectId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_entries_${ts}` });
    projectId = res.body.id;
  });

  it("creates an entry with tags", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 30, values: {}, tags: ["research", "urgent"] });

    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(["research", "urgent"]);
  });

  it("returns tags on GET entries", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/entries`).set(H);
    const entry = res.body.find((e: any) => e.tags.includes("research"));
    expect(entry.tags).toEqual(["research", "urgent"]);
  });

  it("replaces an entry's tag set on update", async () => {
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 15, values: {}, tags: ["draft"] });
    const entryId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(H)
      .send({ tags: ["final"] });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tags).toEqual(["final"]);
  });

  it("leaves tags untouched when omitted from an entry update", async () => {
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({ durationMinutes: 15, values: {}, tags: ["keep-me"] });
    const entryId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(H)
      .send({ durationMinutes: 20 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tags).toEqual(["keep-me"]);
  });
});

// ── Tag vocabulary endpoints ──────────────────────────────────────────────

describe("GET/DELETE /tags", () => {
  it("lists the caller's own tags, alphabetically", async () => {
    const res = await request(app).get("/api/tags").set(H);
    expect(res.status).toBe(200);
    const names = res.body.map((t: any) => t.name);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("urgent");
  });

  it("deletes a tag and detaches it from everything it was on", async () => {
    const projRes = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `__tags_delete_${ts}`, tags: ["throwaway"] });
    const project = projRes.body;
    const tagRow = await prisma.tag.findFirst({ where: { userId: USER_ID, name: "throwaway" } });

    const delRes = await request(app).delete(`/api/tags/${tagRow!.id}`).set(H);
    expect(delRes.status).toBe(204);

    const refetched = await request(app).get(`/api/projects/${project.id}`).set(H);
    expect(refetched.body.tags).toEqual([]);
  });

  it("returns 404 deleting a tag that isn't the caller's", async () => {
    const res = await request(app)
      .delete("/api/tags/00000000-0000-0000-0000-000000000000")
      .set(H);
    expect(res.status).toBe(404);
  });
});
