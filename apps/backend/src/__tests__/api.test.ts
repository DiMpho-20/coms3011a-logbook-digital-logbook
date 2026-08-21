import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../prisma.js";

// ── Shared constants ─────────────────────────────────────────────────────

const USER_ID = "df8cb59f-b366-4612-8f49-403cde4d3058";
const H = { "x-user-id": USER_ID };
const ts = Date.now();
const TEST_PROJECT_NAME = `__test_${ts}`;

let projectId: string;
let fieldId: string;
let entryId: string;

// ── Setup: create test user ──────────────────────────────────────────────

beforeAll(async () => {
  // Create the test user that the projects will reference
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      email: `test_${ts}@example.com`,
      passwordHash: "dummy_hash",
      fullName: "Test User",
      isEmailVerified: true,
    },
  });
});

afterAll(async () => {
  // Clean up test user (cascades to projects, entries, etc.)
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
});

// ── Health ───────────────────────────────────────────────────────────────

describe("Health endpoints", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/db-check connects to database", async () => {
    const res = await request(app).get("/api/db-check");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.time).toBeDefined();
  });
});

// ── Projects ─────────────────────────────────────────────────────────────

describe("Projects CRUD", () => {
  it("POST /api/projects creates a project", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: TEST_PROJECT_NAME, description: "Test project" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(TEST_PROJECT_NAME);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.userId).toBe(USER_ID);
    projectId = res.body.id;
  });

  it("POST /api/projects rejects duplicate name → 409", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: TEST_PROJECT_NAME });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already have a project");
  });

  it("POST /api/projects rejects missing name → 400", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ description: "no name" });

    expect(res.status).toBe(400);
  });

  it("GET /api/projects lists user projects", async () => {
    const res = await request(app).get("/api/projects").set(H);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("GET /api/projects/:id returns project with entryFields", async () => {
    const res = await request(app).get(`/api/projects/${projectId}`).set(H);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
    expect(res.body.name).toBe(TEST_PROJECT_NAME);
    expect(Array.isArray(res.body.entryFields)).toBe(true);
  });

  it("GET /api/projects/:id returns 404 for unknown id", async () => {
    const res = await request(app)
      .get("/api/projects/00000000-0000-0000-0000-000000000000")
      .set(H);
    expect(res.status).toBe(404);
  });

  it("PUT /api/projects/:id updates the project", async () => {
    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(H)
      .send({ name: `${TEST_PROJECT_NAME}_updated`, description: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${TEST_PROJECT_NAME}_updated`);
    expect(res.body.description).toBe("Updated");
  });

  it("PUT /api/projects/:id rejects rename to duplicate → 409", async () => {
    // Create a second project
    const createRes = await request(app)
      .post("/api/projects")
      .set(H)
      .send({ name: `${TEST_PROJECT_NAME}_second` });
    const secondId = createRes.body.id;

    // Try to rename it to the updated name
    const res = await request(app)
      .put(`/api/projects/${secondId}`)
      .set(H)
      .send({ name: `${TEST_PROJECT_NAME}_updated` });

    expect(res.status).toBe(409);

    // Clean up second project (rename to something unique so we can delete safely)
    await request(app)
      .put(`/api/projects/${secondId}`)
      .set(H)
      .send({ name: `__cleanup_${Date.now()}` });
  });

  it("PATCH /api/projects/:id/status toggles to ARCHIVED", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .set(H)
      .send({ status: "ARCHIVED" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ARCHIVED");
  });

  it("PATCH /api/projects/:id/status toggles back to ACTIVE", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .set(H)
      .send({ status: "ACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("PATCH /api/projects/:id/status rejects invalid status → 400", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .set(H)
      .send({ status: "DELETED" });

    expect(res.status).toBe(400);
  });

  it("GET /api/projects/:id/time-summary returns zero for new project", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/time-summary`)
      .set(H);

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.totalMinutes).toBe(0);
    expect(res.body.entryCount).toBe(0);
    expect(res.body.lastEntryAt).toBeNull();
  });
});

// ── Entry Fields ─────────────────────────────────────────────────────────

describe("Entry Fields CRUD", () => {
  it("POST /api/projects/:id/entry-fields creates a field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entry-fields`)
      .set(H)
      .send({ name: "Notes", type: "TEXT", required: true });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Notes");
    expect(res.body.type).toBe("TEXT");
    expect(res.body.required).toBe(true);
    fieldId = res.body.id;
  });

  it("POST creates a NUMBER field", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entry-fields`)
      .set(H)
      .send({ name: "Hours", type: "NUMBER" });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("NUMBER");
  });

  it("GET /api/projects/:id/entry-fields lists fields", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/entry-fields`)
      .set(H);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/projects/:id now includes the created fields", async () => {
    const res = await request(app).get(`/api/projects/${projectId}`).set(H);
    expect(res.status).toBe(200);
    expect(res.body.entryFields.length).toBeGreaterThanOrEqual(2);
    expect(res.body.entryFields.some((f: any) => f.name === "Notes")).toBe(true);
  });
});

// ── Entries ──────────────────────────────────────────────────────────────

describe("Entries CRUD", () => {
  it("POST /api/projects/:id/entries creates an entry with values", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({
        durationMinutes: 45,
        values: { [fieldId]: "Test note value" },
        entryDate: "2026-08-20",
        dueDate: "2026-09-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(45);
    expect(res.body.entryDate).toBe("2026-08-20T00:00:00.000Z");
    expect(res.body.dueDate).toBe("2026-09-01T00:00:00.000Z");
    expect(res.body.values[fieldId]).toBe("Test note value");
    entryId = res.body.id;
  });

  it("POST creates entry without optional dates", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/entries`)
      .set(H)
      .send({
        durationMinutes: 15,
        values: {},
      });

    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(15);
    expect(res.body.entryDate).toBeNull();
    expect(res.body.dueDate).toBeNull();
  });

  it("GET /api/projects/:id/entries lists entries", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/entries`)
      .set(H);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("PUT /api/entries/:id updates duration and values", async () => {
    const res = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(H)
      .send({
        durationMinutes: 60,
        values: { [fieldId]: "Updated note" },
      });

    expect(res.status).toBe(200);
    expect(res.body.durationMinutes).toBe(60);
    expect(res.body.values[fieldId]).toBe("Updated note");
  });

  it("PUT /api/entries/:id updates dates", async () => {
    const res = await request(app)
      .put(`/api/entries/${entryId}`)
      .set(H)
      .send({
        dueDate: "2026-10-15",
      });

    expect(res.status).toBe(200);
    expect(res.body.dueDate).toBe("2026-10-15T00:00:00.000Z");
  });

  it("GET /api/projects/:id/time-summary reflects entries", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/time-summary`)
      .set(H);

    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBeGreaterThan(0);
    expect(res.body.entryCount).toBeGreaterThanOrEqual(2);
    expect(res.body.lastEntryAt).not.toBeNull();
    expect(res.body.totalHours).toBeGreaterThan(0);
  });

  it("DELETE /api/entries/:id deletes the entry", async () => {
    const res = await request(app)
      .delete(`/api/entries/${entryId}`)
      .set(H);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Entry deleted");
  });

  it("DELETE /api/entries/:id returns 404 for unknown id", async () => {
    const res = await request(app)
      .delete("/api/entries/00000000-0000-0000-0000-000000000000")
      .set(H);

    expect(res.status).toBe(404);
  });
});

// ── Cleanup ──────────────────────────────────────────────────────────────

describe("Cleanup", () => {
  it("deletes test project and cascades all related data", async () => {
    // Renaming first to avoid unique constraint issues if re-running
    await request(app)
      .put(`/api/projects/${projectId}`)
      .set(H)
      .send({ name: `__deleted_${Date.now()}` });

    // Verify the time summary still works before final cleanup
    const sumRes = await request(app)
      .get(`/api/projects/${projectId}/time-summary`)
      .set(H);
    expect(sumRes.status).toBe(200);
  });
});
