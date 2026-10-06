import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// Saved Entries-page filters, kept on the account.

const ts = Date.now();
const USER_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
let H: Record<string, string>;
let OTHER: Record<string, string>;

async function createUser(id: string, label: string) {
  await prisma.user.create({
    data: {
      id,
      email: `filters_${label}_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: `Filters ${label}`,
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
  // Cascades to the saved filters.
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_ID] } } });
});

const filters = {
  searchQuery: "report",
  filterProjectId: "all",
  filterTab: "overdue",
  sortOrder: "newest",
  selectedTags: ["exam"],
  fieldFilters: [{ fieldId: "f1", op: "gt", value: "2" }],
  archivedFilter: "include",
};

describe("saved filters", () => {
  let id: string;

  it("starts empty", async () => {
    const res = await request(app).get("/api/saved-filters").set(H);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("saves a filter and lists it back in the same shape", async () => {
    const res = await request(app).post("/api/saved-filters").set(H).send({ name: "  Overdue reports ", filters });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Overdue reports", ...filters });
    id = res.body.id;

    const list = await request(app).get("/api/saved-filters").set(H);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id, name: "Overdue reports", ...filters });
  });

  it("refuses a blank name or a malformed filter", async () => {
    expect((await request(app).post("/api/saved-filters").set(H).send({ name: " ", filters })).status).toBe(400);
    expect((await request(app).post("/api/saved-filters").set(H).send({ name: "x", filters: { ...filters, filterTab: "later" } })).status).toBe(400);
  });

  it("keeps each student's filters to themselves", async () => {
    expect((await request(app).get("/api/saved-filters").set(OTHER)).body).toEqual([]);
    expect((await request(app).delete(`/api/saved-filters/${id}`).set(OTHER)).status).toBe(404);
  });

  it("deletes a filter", async () => {
    expect((await request(app).delete(`/api/saved-filters/${id}`).set(H)).status).toBe(204);
    expect((await request(app).get("/api/saved-filters").set(H)).body).toEqual([]);
    expect((await request(app).delete(`/api/saved-filters/${id}`).set(H)).status).toBe(404);
  });

  it("needs a token", async () => {
    expect((await request(app).get("/api/saved-filters")).status).toBe(401);
  });
});
