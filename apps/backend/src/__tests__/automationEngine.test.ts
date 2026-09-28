import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";

// US26 end to end: rule CRUD, the two triggers, condition and action
// behaviour, ownership, and the two properties that make automatic mutation of
// someone's data safe — it cannot loop, and it cannot lose their entry.

const ts = Date.now();

const OWNER_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
const PROJECT_ID = crypto.randomUUID();
const OTHER_PROJECT_ID = crypto.randomUUID();
const HOURS_FIELD = crypto.randomUUID();
const NOTES_FIELD = crypto.randomUUID();
const OTHER_FIELD = crypto.randomUUID();
const LONG_TAG = crypto.randomUUID();
const DONE_TAG = crypto.randomUUID();
const OTHER_TAG = crypto.randomUUID();

let owner: Record<string, string>;
let other: Record<string, string>;

const rulesUrl = (projectId = PROJECT_ID) => `/api/projects/${projectId}/automation-rules`;

/** A rule body, with the pieces a test does not care about filled in. */
const ruleBody = (over: Record<string, unknown> = {}) => ({
  name: `Rule ${crypto.randomUUID().slice(0, 8)}`,
  trigger: "ENTRY_CREATED",
  conditions: [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GT", value: 240 }],
  action: { type: "ADD_TAG", tagId: LONG_TAG },
  ...over,
});

const createRule = async (over: Record<string, unknown> = {}, auth = owner) => {
  const res = await request(app).post(rulesUrl()).set(auth).send(ruleBody(over));
  expect(res.status).toBe(201);
  return res.body;
};

/** Create an entry and return the API's view of it, after automation. */
const createEntry = async (body: Record<string, unknown> = {}) => {
  const res = await request(app)
    .post(`/api/projects/${PROJECT_ID}/entries`)
    .set(owner)
    .send({ durationMinutes: 300, values: {}, tags: [], ...body });
  expect(res.status).toBe(201);
  return res.body;
};

const tagNames = (entry: { tags?: string[] }) => [...(entry.tags ?? [])].sort();

const versionCount = (entryId: string) => prisma.entryVersion.count({ where: { entryId } });

beforeAll(async () => {
  const passwordHash = await hashPassword("Password123");
  await prisma.user.createMany({
    data: [
      { id: OWNER_ID, email: `auto_owner_${ts}@example.com`, passwordHash, fullName: "Rule Owner", isEmailVerified: true },
      { id: OTHER_ID, email: `auto_other_${ts}@example.com`, passwordHash, fullName: "Someone Else", isEmailVerified: true },
    ],
  });
  await prisma.project.createMany({
    data: [
      { id: PROJECT_ID, userId: OWNER_ID, name: `Automation ${ts}` },
      { id: OTHER_PROJECT_ID, userId: OTHER_ID, name: `Not yours ${ts}` },
    ],
  });
  await prisma.entryField.createMany({
    data: [
      { id: HOURS_FIELD, projectId: PROJECT_ID, name: "Hours", type: "NUMBER", required: false },
      { id: NOTES_FIELD, projectId: PROJECT_ID, name: "Notes", type: "TEXT", required: false },
      { id: OTHER_FIELD, projectId: OTHER_PROJECT_ID, name: "Secret", type: "NUMBER", required: false },
    ],
  });
  await prisma.tag.createMany({
    data: [
      { id: LONG_TAG, userId: OWNER_ID, name: `long-session-${ts}` },
      { id: DONE_TAG, userId: OWNER_ID, name: `completed-${ts}` },
      { id: OTHER_TAG, userId: OTHER_ID, name: `theirs-${ts}` },
    ],
  });

  owner = { Authorization: `Bearer ${generateToken(OWNER_ID)}` };
  other = { Authorization: `Bearer ${generateToken(OTHER_ID)}` };
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, OTHER_ID] } } });
});

beforeEach(async () => {
  // Each test starts from no rules and no entries, so ordering between tests
  // cannot change an outcome.
  await prisma.automationRule.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.logbookEntry.deleteMany({ where: { projectId: PROJECT_ID } });
});

describe("rule CRUD", () => {
  it("creates a rule", async () => {
    const rule = await createRule({ name: `Tag long sessions ${ts}` });

    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe(`Tag long sessions ${ts}`);
    expect(rule.trigger).toBe("ENTRY_CREATED");
    expect(rule.enabled).toBe(true);
    expect(rule.invalidReason).toBeNull();
  });

  it("lists rules in the order they will fire", async () => {
    const first = await createRule({ name: `A ${ts}` });
    const second = await createRule({ name: `B ${ts}` });

    const res = await request(app).get(rulesUrl()).set(owner);
    expect(res.status).toBe(200);
    expect(res.body.map((rule: { id: string }) => rule.id)).toEqual([first.id, second.id]);
  });

  it("reads one rule", async () => {
    const rule = await createRule();
    const res = await request(app).get(`${rulesUrl()}/${rule.id}`).set(owner);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(rule.id);
  });

  it("updates a rule", async () => {
    const rule = await createRule();
    const res = await request(app)
      .patch(`${rulesUrl()}/${rule.id}`)
      .set(owner)
      .send({ name: `Renamed ${ts}`, action: { type: "SET_STATUS", status: "DONE" } });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Renamed ${ts}`);
    expect(res.body.action).toEqual({ type: "SET_STATUS", status: "DONE" });
  });

  it("disables and re-enables a rule without deleting it", async () => {
    const rule = await createRule();

    const disabled = await request(app).patch(`${rulesUrl()}/${rule.id}`).set(owner).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.enabled).toBe(false);

    const enabled = await request(app).patch(`${rulesUrl()}/${rule.id}`).set(owner).send({ enabled: true });
    expect(enabled.body.enabled).toBe(true);
  });

  it("deletes a rule", async () => {
    const rule = await createRule();
    expect((await request(app).delete(`${rulesUrl()}/${rule.id}`).set(owner)).status).toBe(200);
    expect((await request(app).get(`${rulesUrl()}/${rule.id}`).set(owner)).status).toBe(404);
  });

  it("refuses a second rule with the same name in one project", async () => {
    await createRule({ name: `Duplicate ${ts}` });
    const res = await request(app).post(rulesUrl()).set(owner).send(ruleBody({ name: `Duplicate ${ts}` }));

    expect(res.status).toBe(409);
  });
});

describe("rejecting rules that could not work", () => {
  const reject = async (over: Record<string, unknown>) =>
    request(app).post(rulesUrl()).set(owner).send(ruleBody(over));

  it("refuses an empty name", async () => {
    expect((await reject({ name: "   " })).status).toBe(400);
  });

  it("refuses an unknown trigger", async () => {
    expect((await reject({ trigger: "ENTRY_ARCHIVED" })).status).toBe(400);
  });

  it("refuses a rule with no conditions", async () => {
    // It would fire on every save, which is never the intent.
    expect((await reject({ conditions: [] })).status).toBe(400);
  });

  it("refuses an unsupported action", async () => {
    expect((await reject({ action: { type: "SEND_EMAIL", to: "x@y.z" } })).status).toBe(400);
    expect((await reject({ action: { type: "CREATE_ENTRY" } })).status).toBe(400);
  });

  it("refuses an action missing its parameter", async () => {
    expect((await reject({ action: { type: "ADD_TAG" } })).status).toBe(400);
    expect((await reject({ action: { type: "SET_STATUS" } })).status).toBe(400);
  });

  it("refuses an ordering operator on a TEXT field", async () => {
    const res = await reject({
      conditions: [{ source: "FIELD", fieldId: NOTES_FIELD, operator: "GT", value: 5 }],
    });
    expect(res.status).toBe(400);
  });

  it("refuses a numeric field compared with text", async () => {
    const res = await reject({
      conditions: [{ source: "FIELD", fieldId: HOURS_FIELD, operator: "GT", value: "four" }],
    });
    expect(res.status).toBe(400);
  });

  it("refuses a comparison with no value, and a presence test with one", async () => {
    expect((await reject({ conditions: [{ source: "FIELD", fieldId: HOURS_FIELD, operator: "GT" }] })).status).toBe(400);
    expect(
      (await reject({ conditions: [{ source: "FIELD", fieldId: HOURS_FIELD, operator: "IS_EMPTY", value: 3 }] })).status
    ).toBe(400);
  });

  it("refuses a field id that is not a field of this project", async () => {
    const res = await reject({
      conditions: [{ source: "FIELD", fieldId: crypto.randomUUID(), operator: "GT", value: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("refuses a tag id that is not the owner's", async () => {
    expect((await reject({ action: { type: "ADD_TAG", tagId: OTHER_TAG } })).status).toBe(400);
  });

  it("refuses a status comparison against a status that does not exist", async () => {
    const res = await reject({
      conditions: [{ source: "ATTRIBUTE", attribute: "status", operator: "EQ", value: "ARCHIVED" }],
    });
    expect(res.status).toBe(400);
  });
});

describe("triggers", () => {
  it("runs an ENTRY_CREATED rule when an entry is created", async () => {
    await createRule({ trigger: "ENTRY_CREATED" });
    const entry = await createEntry({ durationMinutes: 300 });

    expect(tagNames(entry)).toContain(`long-session-${ts}`);
  });

  it("does not run an ENTRY_UPDATED rule on creation", async () => {
    await createRule({ trigger: "ENTRY_UPDATED" });
    const entry = await createEntry({ durationMinutes: 300 });

    expect(tagNames(entry)).toHaveLength(0);
  });

  it("runs an ENTRY_UPDATED rule when an entry is saved again", async () => {
    await createRule({ trigger: "ENTRY_UPDATED" });
    const entry = await createEntry({ durationMinutes: 60 });
    expect(tagNames(entry)).toHaveLength(0);

    const updated = await request(app).put(`/api/entries/${entry.id}`).set(owner).send({ durationMinutes: 300 });
    expect(updated.status).toBe(200);
    expect(tagNames(updated.body)).toContain(`long-session-${ts}`);
  });

  it("runs an ENTRY_UPDATED rule when only the status endpoint is used", async () => {
    // Otherwise "when an entry is marked done" would depend on which endpoint
    // the UI reached for.
    await createRule({
      trigger: "ENTRY_UPDATED",
      conditions: [{ source: "ATTRIBUTE", attribute: "status", operator: "EQ", value: "DONE" }],
      action: { type: "ADD_TAG", tagId: DONE_TAG },
    });
    const entry = await createEntry();

    const res = await request(app).patch(`/api/entries/${entry.id}/status`).set(owner).send({ status: "DONE" });
    expect(res.status).toBe(200);
    expect(tagNames(res.body)).toContain(`completed-${ts}`);
  });

  it("does not run a disabled rule", async () => {
    await createRule({ enabled: false });
    expect(tagNames(await createEntry({ durationMinutes: 300 }))).toHaveLength(0);
  });
});

describe("conditions against a real entry", () => {
  const hoursRule = (operator: string, value: unknown) =>
    createRule({ conditions: [{ source: "FIELD", fieldId: HOURS_FIELD, operator, value }] });

  it("acts when the condition holds", async () => {
    await hoursRule("GT", 4);
    const entry = await createEntry({ values: { [HOURS_FIELD]: 6 } });

    expect(tagNames(entry)).toContain(`long-session-${ts}`);
  });

  it("does not act when the condition does not hold", async () => {
    await hoursRule("GT", 4);
    const entry = await createEntry({ values: { [HOURS_FIELD]: 2 } });

    expect(tagNames(entry)).toHaveLength(0);
  });

  it("does not act when the field was left blank", async () => {
    // A blank NUMBER is not zero — the entry has no value row at all.
    await hoursRule("LT", 1);
    expect(tagNames(await createEntry({ values: {} }))).toHaveLength(0);
  });

  it("treats a blank field as empty for a presence test", async () => {
    await createRule({ conditions: [{ source: "FIELD", fieldId: NOTES_FIELD, operator: "IS_EMPTY" }] });
    expect(tagNames(await createEntry({ values: {} }))).toContain(`long-session-${ts}`);
  });

  it("requires every condition of a multi-condition rule", async () => {
    await createRule({
      conditions: [
        { source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 240 },
        { source: "FIELD", fieldId: HOURS_FIELD, operator: "GTE", value: 4 },
      ],
    });

    expect(tagNames(await createEntry({ durationMinutes: 300, values: { [HOURS_FIELD]: 6 } }))).toHaveLength(1);
    expect(tagNames(await createEntry({ durationMinutes: 300, values: { [HOURS_FIELD]: 1 } }))).toHaveLength(0);
  });

  it("stops running a rule whose field has since been archived", async () => {
    const spare = crypto.randomUUID();
    await prisma.entryField.create({
      data: { id: spare, projectId: PROJECT_ID, name: "Temporary", type: "NUMBER", required: false },
    });
    await createRule({ conditions: [{ source: "FIELD", fieldId: spare, operator: "GTE", value: 0 }] });

    await prisma.entryField.update({ where: { id: spare }, data: { archivedAt: new Date() } });

    // Refuses to act rather than guessing which field was meant.
    expect(tagNames(await createEntry({ durationMinutes: 300 }))).toHaveLength(0);

    const listed = await request(app).get(rulesUrl()).set(owner);
    expect(listed.body[0].invalidReason).toMatch(/no longer available/i);
  });
});

describe("actions", () => {
  it("adds a tag", async () => {
    await createRule();
    expect(tagNames(await createEntry({ durationMinutes: 300 }))).toEqual([`long-session-${ts}`]);
  });

  it("removes a tag the user applied", async () => {
    await createRule({ action: { type: "REMOVE_TAG", tagId: LONG_TAG } });
    const entry = await createEntry({ durationMinutes: 300, tags: [`long-session-${ts}`] });

    expect(tagNames(entry)).toHaveLength(0);
  });

  it("sets the status, maintaining completedAt as a manual change would", async () => {
    await createRule({ action: { type: "SET_STATUS", status: "DONE" } });
    const entry = await createEntry({ durationMinutes: 300 });

    expect(entry.status).toBe("DONE");
    expect(entry.completedAt).toBeTruthy();
  });

  it("adds a tag only once however often the rule runs", async () => {
    // What makes offline replay safe: EntryTag's primary key is (entryId,
    // tagId) and the insert skips duplicates.
    await createRule({ trigger: "ENTRY_UPDATED" });
    const entry = await createEntry({ durationMinutes: 300 });

    for (let i = 0; i < 3; i += 1) {
      await request(app).put(`/api/entries/${entry.id}`).set(owner).send({ durationMinutes: 300 });
    }

    expect(await prisma.entryTag.count({ where: { entryId: entry.id, tagId: LONG_TAG } })).toBe(1);
  });

  it("applies several matching rules to one entry", async () => {
    await createRule({ name: `Long ${ts}`, conditions: [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GT", value: 240 }] });
    await createRule({
      name: `Very long ${ts}`,
      conditions: [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GT", value: 480 }],
      action: { type: "ADD_TAG", tagId: DONE_TAG },
    });

    expect(tagNames(await createEntry({ durationMinutes: 600 }))).toEqual(
      [`completed-${ts}`, `long-session-${ts}`].sort()
    );
    expect(tagNames(await createEntry({ durationMinutes: 300 }))).toEqual([`long-session-${ts}`]);
  });

  it("resolves two conflicting rules by creation order, last one winning", async () => {
    const always = [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 0 }];
    await createRule({ name: `First ${ts}`, conditions: always, action: { type: "SET_STATUS", status: "DONE" } });
    await createRule({ name: `Second ${ts}`, conditions: always, action: { type: "SET_STATUS", status: "OPEN" } });

    expect((await createEntry()).status).toBe("OPEN");
  });
});

describe("history", () => {
  it("records what automation did as its own version", async () => {
    // toSnapshot covers tags, so without this the history would show version 1
    // with no tag while the entry has one.
    await createRule();
    const entry = await createEntry({ durationMinutes: 300 });

    const res = await request(app).get(`/api/entries/${entry.id}/versions`).set(owner);
    expect(res.status).toBe(200);
    expect(res.body.versions.length).toBeGreaterThanOrEqual(2);

    const latest = res.body.versions[res.body.versions.length - 1];
    expect(latest.snapshot.tags).toContain(`long-session-${ts}`);
  });

  it("adds no version when no rule matched", async () => {
    await createRule();
    const entry = await createEntry({ durationMinutes: 10 });

    expect(await versionCount(entry.id)).toBe(1);
  });
});

describe("automation cannot loop", () => {
  it("does not re-trigger itself when its action satisfies its own condition", async () => {
    // The shape that would loop if automation re-entered the update path:
    // "when an entry is updated and its status is DONE, set it DONE".
    await createRule({
      trigger: "ENTRY_UPDATED",
      conditions: [{ source: "ATTRIBUTE", attribute: "status", operator: "EQ", value: "DONE" }],
      action: { type: "SET_STATUS", status: "DONE" },
    });
    const entry = await createEntry();

    const res = await request(app).patch(`/api/entries/${entry.id}/status`).set(owner).send({ status: "DONE" });
    expect(res.status).toBe(200);

    // Exactly two: creation, and the status change the user asked for. A loop
    // would append versions without bound instead.
    expect(await versionCount(entry.id)).toBe(2);
  });

  it("does not let one rule's action feed another rule's condition", async () => {
    // Every rule is evaluated against the entry as the user saved it, so the
    // first rule's tag is invisible to the second within the same pass.
    await createRule({
      name: `Sets done ${ts}`,
      conditions: [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 0 }],
      action: { type: "SET_STATUS", status: "DONE" },
    });
    await createRule({
      name: `Reacts to done ${ts}`,
      conditions: [{ source: "ATTRIBUTE", attribute: "status", operator: "EQ", value: "DONE" }],
      action: { type: "ADD_TAG", tagId: DONE_TAG },
    });

    const entry = await createEntry({ durationMinutes: 300 });

    expect(entry.status).toBe("DONE");
    // The second rule saw OPEN, because that is what the user saved.
    expect(tagNames(entry)).toHaveLength(0);
  });

  it("terminates with many always-true rules", async () => {
    const always = [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 0 }];
    for (let i = 0; i < 5; i += 1) {
      await createRule({ name: `Churn ${i} ${ts}`, conditions: always, action: { type: "SET_STATUS", status: i % 2 ? "OPEN" : "DONE" } });
    }

    const entry = await createEntry();
    // One pass: five status writes, one version.
    expect(await versionCount(entry.id)).toBe(2);
  });
});

describe("a broken rule never costs the user their entry", () => {
  it("keeps the entry when a stored rule is malformed", async () => {
    const rule = await createRule();
    // Reach past validation the way a hand-edited row or an older app version
    // would, and confirm the runner survives it.
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { conditions: { nonsense: true } as never },
    });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/entries`)
      .set(owner)
      .send({ durationMinutes: 300, values: {}, tags: [] });

    expect(res.status).toBe(201);
    expect(await prisma.logbookEntry.count({ where: { id: res.body.id } })).toBe(1);
  });

  it("keeps running the remaining rules after a broken one", async () => {
    const broken = await createRule({ name: `Broken ${ts}` });
    await prisma.automationRule.update({
      where: { id: broken.id },
      data: { action: "not-an-object" as never },
    });
    await createRule({ name: `Healthy ${ts}`, action: { type: "ADD_TAG", tagId: DONE_TAG } });

    // Rules are independent, so one bad row must not silence the others.
    expect(tagNames(await createEntry({ durationMinutes: 300 }))).toEqual([`completed-${ts}`]);
  });
});

describe("ownership", () => {
  it("hides another user's rules from the list", async () => {
    await createRule();
    const res = await request(app).get(rulesUrl()).set(other);

    // 404 on the project, not an empty list: the project is not theirs.
    expect(res.status).toBe(404);
  });

  it("refuses to read another user's rule", async () => {
    const rule = await createRule();
    expect((await request(app).get(`${rulesUrl()}/${rule.id}`).set(other)).status).toBe(404);
  });

  it("refuses to edit another user's rule", async () => {
    const rule = await createRule();
    const res = await request(app).patch(`${rulesUrl()}/${rule.id}`).set(other).send({ enabled: false });

    expect(res.status).toBe(404);
    expect((await prisma.automationRule.findUnique({ where: { id: rule.id } }))?.enabled).toBe(true);
  });

  it("refuses to delete another user's rule", async () => {
    const rule = await createRule();
    expect((await request(app).delete(`${rulesUrl()}/${rule.id}`).set(other)).status).toBe(404);
    expect(await prisma.automationRule.count({ where: { id: rule.id } })).toBe(1);
  });

  it("refuses to attach a rule to another user's project", async () => {
    const res = await request(app)
      .post(`/api/projects/${OTHER_PROJECT_ID}/automation-rules`)
      .set(owner)
      .send(ruleBody());

    expect(res.status).toBe(404);
    expect(await prisma.automationRule.count({ where: { projectId: OTHER_PROJECT_ID } })).toBe(0);
  });

  it("refuses a condition referencing another user's field", async () => {
    const res = await request(app)
      .post(rulesUrl())
      .set(owner)
      .send(ruleBody({ conditions: [{ source: "FIELD", fieldId: OTHER_FIELD, operator: "GT", value: 1 }] }));

    expect(res.status).toBe(400);
  });

  it("refuses an action referencing another user's tag", async () => {
    const res = await request(app)
      .post(rulesUrl())
      .set(owner)
      .send(ruleBody({ action: { type: "ADD_TAG", tagId: OTHER_TAG } }));

    expect(res.status).toBe(400);
  });

  it("does not let one user's rules touch another user's entries", async () => {
    await createRule({ conditions: [{ source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 0 }] });

    const theirs = await request(app)
      .post(`/api/projects/${OTHER_PROJECT_ID}/entries`)
      .set(other)
      .send({ durationMinutes: 300, values: {}, tags: [] });

    expect(theirs.status).toBe(201);
    expect(theirs.body.tags ?? []).toHaveLength(0);
  });

  it("requires authentication", async () => {
    expect((await request(app).get(rulesUrl())).status).toBe(401);
    expect((await request(app).post(rulesUrl()).send(ruleBody())).status).toBe(401);
  });
});
