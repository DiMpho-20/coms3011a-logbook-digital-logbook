import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// ── Fixtures ─────────────────────────────────────────────────────────────
// US17 saves a definition, never a number. Two owners, because every one of
// these operations has to be provably scoped to the person who saved it.

const OWNER = crypto.randomUUID();
const STRANGER = crypto.randomUUID();
const ts = Date.now();

let OWNER_AUTH: Record<string, string>;
let STRANGER_AUTH: Record<string, string>;
let projectId = "";
let strangerProjectId = "";
let hoursFieldId = "";

let sharedHash: Promise<string> | null = null;
const fixtureHash = () => (sharedHash ??= hashPassword("Password123"));

async function makeUser(id: string, label: string) {
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      email: `stat_${label}_${ts}@example.com`,
      passwordHash: await fixtureHash(),
      fullName: `Statistic ${label}`,
      isEmailVerified: true,
    },
  });
  return { Authorization: `Bearer ${generateToken(id)}` };
}

const base = (id = projectId) => `/api/projects/${id}/custom-statistics`;
const addHours = (value: number) =>
  request(app)
    .post(`/api/projects/${projectId}/entries`)
    .set(OWNER_AUTH)
    .send({ durationMinutes: 0, values: { [hoursFieldId]: value } });

/** Saves one statistic and returns it, so each test starts from a clean slate. */
const save = (name: string, expression: string, auth = OWNER_AUTH, id = projectId) =>
  request(app).post(base(id)).set(auth).send({ name, expression });

beforeAll(async () => {
  [OWNER_AUTH, STRANGER_AUTH] = await Promise.all([
    makeUser(OWNER, "owner"),
    makeUser(STRANGER, "stranger"),
  ]);

  const [project, stranger] = await Promise.all([
    prisma.project.create({ data: { userId: OWNER, name: `__stat_${ts}` } }),
    prisma.project.create({ data: { userId: STRANGER, name: `__stat_stranger_${ts}` } }),
  ]);
  projectId = project.id;
  strangerProjectId = stranger.id;

  const hours = await prisma.entryField.create({
    data: { projectId, name: "Hours", type: "NUMBER" },
  });
  hoursFieldId = hours.id;
  await prisma.entryField.create({ data: { projectId, name: "Notes", type: "TEXT" } });

  for (const value of [2, 4, 6]) await addHours(value);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, STRANGER] } } }).catch(() => {});
});

describe("custom statistics — saving one", () => {
  it("saves a valid expression and answers with its value now", async () => {
    const res = await save(`Average ${ts}`, "AVG({Hours})");

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Average ${ts}`);
    expect(res.body.expression).toBe("AVG({Hours})");
    expect(res.body.value).toBe(4);
    expect(res.body.error).toBeNull();
  });

  it("trims the name and the expression before storing them", async () => {
    const res = await save(`  Padded ${ts}  `, "  COUNT()  ");

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Padded ${ts}`);
    expect(res.body.expression).toBe("COUNT()");
  });

  it("saves an expression that has nothing to work on yet", async () => {
    // Validation asks whether this could ever work, not what it is worth
    // today — a statistic over an empty field is still a real statistic.
    await prisma.entryField.create({ data: { projectId, name: `Future ${ts}`, type: "NUMBER" } });
    const res = await save(`Future avg ${ts}`, `AVG({Future ${ts}})`);

    expect(res.status).toBe(201);
    // It saved, and says plainly why it has no number rather than inventing one.
    expect(res.body.value).toBeNull();
    expect(res.body.error).toMatch(/no entry has a number/i);
  });

  it("refuses an expression the parser rejects", async () => {
    const res = await save(`Bad syntax ${ts}`, "AVG({Hours}");
    expect(res.status).toBe(400);
    expect(await prisma.customStatistic.findFirst({ where: { name: `Bad syntax ${ts}` } })).toBeNull();
  });

  it("refuses a field the project does not have", async () => {
    const res = await save(`Unknown ${ts}`, "SUM({Nonexistent})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no field called/i);
  });

  it("refuses a field that cannot be aggregated", async () => {
    const res = await save(`Text ${ts}`, "SUM({Notes})");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Number or Computed/i);
  });

  it("refuses an empty name", async () => {
    expect((await save("   ", "COUNT()")).status).toBe(400);
  });

  it("refuses a second statistic with the same name in one project", async () => {
    const name = `Twice ${ts}`;
    expect((await save(name, "COUNT()")).status).toBe(201);

    const again = await save(name, "SUM({Hours})");
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already have a statistic/i);
  });

  it("rejects an unauthenticated save", async () => {
    const res = await request(app).post(base()).send({ name: "Anon", expression: "COUNT()" });
    expect(res.status).toBe(401);
  });

  it("will not attach a statistic to someone else's project", async () => {
    const res = await save(`Trespass ${ts}`, "COUNT()", OWNER_AUTH, strangerProjectId);
    expect(res.status).toBe(404);
    expect(await prisma.customStatistic.findFirst({ where: { name: `Trespass ${ts}` } })).toBeNull();
  });

  it("will not save against a project that does not exist", async () => {
    expect((await save(`Ghost ${ts}`, "COUNT()", OWNER_AUTH, crypto.randomUUID())).status).toBe(404);
  });
});

describe("custom statistics — reading them back", () => {
  it("lists the project's statistics with their current values", async () => {
    const name = `Listed ${ts}`;
    await save(name, "SUM({Hours})");

    const res = await request(app).get(base()).set(OWNER_AUTH);
    expect(res.status).toBe(200);
    const found = res.body.find((item: any) => item.name === name);
    expect(found.value).toBe(12);
    expect(found.expression).toBe("SUM({Hours})");
  });

  it("keeps one owner's statistics out of another's list", async () => {
    const mine = `Private ${ts}`;
    await save(mine, "COUNT()");

    const theirs = await request(app).get(base(strangerProjectId)).set(STRANGER_AUTH);
    expect(theirs.status).toBe(200);
    expect(theirs.body.some((item: any) => item.name === mine)).toBe(false);
  });

  it("refuses to list another owner's project", async () => {
    expect((await request(app).get(base(strangerProjectId)).set(OWNER_AUTH)).status).toBe(404);
  });

  it("fetches one statistic on its own", async () => {
    const created = await save(`Single ${ts}`, "MAX({Hours})");

    const res = await request(app).get(`${base()}/${created.body.id}`).set(OWNER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(6);
  });

  it("answers 404 for a statistic that does not exist", async () => {
    expect((await request(app).get(`${base()}/${crypto.randomUUID()}`).set(OWNER_AUTH)).status).toBe(404);
  });

  it("will not hand one owner's statistic to another", async () => {
    const created = await save(`Yours ${ts}`, "COUNT()");

    const res = await request(app)
      .get(`/api/projects/${strangerProjectId}/custom-statistics/${created.body.id}`)
      .set(STRANGER_AUTH);
    expect(res.status).toBe(404);
  });

  it("reports a statistic that has stopped working without spoiling the list", async () => {
    // A field it names is archived after the fact; the rest must still read.
    const doomed = await prisma.entryField.create({
      data: { projectId, name: `Temporary ${ts}`, type: "NUMBER" },
    });
    await save(`Doomed ${ts}`, `SUM({Temporary ${ts}})`);
    await prisma.entryField.update({ where: { id: doomed.id }, data: { archivedAt: new Date() } });

    const res = await request(app).get(base()).set(OWNER_AUTH);
    const broken = res.body.find((item: any) => item.name === `Doomed ${ts}`);
    const healthy = res.body.find((item: any) => item.name === `Listed ${ts}`);
    expect(broken.value).toBeNull();
    expect(broken.error).toMatch(/no field called/i);
    expect(healthy.value).toBe(12);
  });
});

describe("custom statistics — changing one", () => {
  it("renames a statistic without touching its expression", async () => {
    const created = await save(`Before ${ts}`, "COUNT()");

    const res = await request(app)
      .patch(`${base()}/${created.body.id}`)
      .set(OWNER_AUTH)
      .send({ name: `After ${ts}` });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`After ${ts}`);
    expect(res.body.expression).toBe("COUNT()");
  });

  it("changes the expression and the value with it", async () => {
    const created = await save(`Switch ${ts}`, "MIN({Hours})");
    expect(created.body.value).toBe(2);

    const res = await request(app)
      .patch(`${base()}/${created.body.id}`)
      .set(OWNER_AUTH)
      .send({ expression: "MAX({Hours})" });

    expect(res.status).toBe(200);
    expect(res.body.value).toBe(6);
  });

  it("refuses an invalid expression and leaves the saved one alone", async () => {
    const created = await save(`Keeps ${ts}`, "SUM({Hours})");

    const res = await request(app)
      .patch(`${base()}/${created.body.id}`)
      .set(OWNER_AUTH)
      .send({ expression: "SUM({Nonexistent})" });

    expect(res.status).toBe(400);
    const stored = await prisma.customStatistic.findUnique({ where: { id: created.body.id } });
    expect(stored!.expression).toBe("SUM({Hours})");
  });

  it("refuses an edit that changes nothing", async () => {
    const created = await save(`Idle ${ts}`, "COUNT()");
    expect((await request(app).patch(`${base()}/${created.body.id}`).set(OWNER_AUTH).send({})).status).toBe(400);
  });

  it("will not let another owner edit it", async () => {
    const created = await save(`Guarded ${ts}`, "COUNT()");

    const res = await request(app)
      .patch(`/api/projects/${strangerProjectId}/custom-statistics/${created.body.id}`)
      .set(STRANGER_AUTH)
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    const stored = await prisma.customStatistic.findUnique({ where: { id: created.body.id } });
    expect(stored!.name).toBe(`Guarded ${ts}`);
  });
});

describe("custom statistics — removing one", () => {
  it("deletes a statistic the owner asks to remove", async () => {
    const created = await save(`Doomed delete ${ts}`, "COUNT()");

    const res = await request(app).delete(`${base()}/${created.body.id}`).set(OWNER_AUTH);
    expect(res.status).toBe(200);
    expect(await prisma.customStatistic.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it("answers 404 when there is nothing to delete", async () => {
    expect((await request(app).delete(`${base()}/${crypto.randomUUID()}`).set(OWNER_AUTH)).status).toBe(404);
  });

  it("will not let another owner delete it", async () => {
    const created = await save(`Safe ${ts}`, "COUNT()");

    const res = await request(app)
      .delete(`/api/projects/${strangerProjectId}/custom-statistics/${created.body.id}`)
      .set(STRANGER_AUTH);

    expect(res.status).toBe(404);
    expect(await prisma.customStatistic.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });
});

// Kept last on purpose: this is the only test that logs another entry, and
// running it earlier would quietly change the totals every test above
// asserts. Nothing here depends on the order of the describes except this.
describe("custom statistics — the value follows the data", () => {
  it("reports a new average once another entry is logged", async () => {
    // The point of storing the definition rather than the number.
    const created = await save(`Follows ${ts}`, "AVG({Hours})");
    expect(created.body.value).toBe(4); // 2, 4, 6

    await addHours(8); // 2, 4, 6, 8

    const again = await request(app).get(`${base()}/${created.body.id}`).set(OWNER_AUTH);
    expect(again.body.value).toBe(5);
    // Nothing about the saved definition changed.
    expect(again.body.expression).toBe("AVG({Hours})");
  });
});
