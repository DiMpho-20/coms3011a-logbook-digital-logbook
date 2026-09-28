import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";

// Push services are external, so web-push itself is faked; everything else
// (routes, database, reminder rules) is real.
const sent = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  return [] as { endpoint: string; payload: Record<string, string> }[];
});
const failures = vi.hoisted(() => new Map<string, number>());

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      const status = failures.get(sub.endpoint);
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

import app from "../app.js";
import prisma from "../prisma.js";
import { hashPassword, generateToken } from "../utils/auth.js";
import { pushDueReminders } from "../utils/push.js";

// US28 follow-up — reminders reach the student's devices by web push.

const ts = Date.now();
const USER_ID = crypto.randomUUID();
let H: Record<string, string>;
const ENDPOINT = `https://push.example.com/${ts}/main`;
const DEAD_ENDPOINT = `https://push.example.com/${ts}/dead`;

const subscription = (endpoint = ENDPOINT) => ({ endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } });
/** Only what went to this test's devices; the database is shared. */
const mine = () => sent.filter((s) => s.endpoint.startsWith(`https://push.example.com/${ts}/`));

async function createReminder(title: string, minutesFromNow: number) {
  const res = await request(app)
    .post("/api/reminders")
    .set(H)
    .send({ title, remindAt: new Date(Date.now() + minutesFromNow * 60_000).toISOString() });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `push_${ts}@example.com`,
      passwordHash: await hashPassword("Password123"),
      fullName: "Push Tester",
      isEmailVerified: true,
    },
  });
  H = { Authorization: `Bearer ${generateToken(USER_ID)}` };
  // Keep the rule-generated reminders out of the way.
  await request(app).put("/api/reminders/settings").set(H).send({ dueSoonEnabled: false, overdueEnabled: false });
});

afterAll(async () => {
  // Cascades to reminders and push subscriptions.
  await prisma.user.deleteMany({ where: { id: USER_ID } });
});

beforeEach(() => {
  sent.length = 0;
});

describe("push subscriptions", () => {
  it("gives out the public key", async () => {
    const res = await request(app).get("/api/push/public-key").set(H);
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe("test-public-key");
  });

  it("rejects a malformed subscription", async () => {
    const res = await request(app).post("/api/push/subscriptions").set(H).send({ endpoint: "not a url" });
    expect(res.status).toBe(400);
  });

  it("requires sign-in", async () => {
    const res = await request(app).post("/api/push/subscriptions").send(subscription());
    expect(res.status).toBe(401);
  });

  it("doesn't push reminders that were already due when the device subscribed", async () => {
    await createReminder("Old reminder", -60);
    const res = await request(app).post("/api/push/subscriptions").set(H).send(subscription());
    expect(res.status).toBe(201);
    await pushDueReminders();
    expect(mine()).toHaveLength(0);
  });

  it("saving the same device twice keeps one subscription", async () => {
    await request(app).post("/api/push/subscriptions").set(H).send(subscription());
    expect(await prisma.pushSubscription.count({ where: { endpoint: ENDPOINT } })).toBe(1);
  });
});

describe("pushing due reminders", () => {
  it("pushes a reminder once it falls due, and only once", async () => {
    const id = await createReminder("Submit lab report", -1);
    await pushDueReminders();
    expect(mine()).toEqual([
      { endpoint: ENDPOINT, payload: expect.objectContaining({ title: "Submit lab report", url: "/reminders", tag: `reminder-${id}` }) },
    ]);

    sent.length = 0;
    await pushDueReminders();
    expect(mine()).toHaveLength(0);
  });

  it("waits for a reminder set in the future", async () => {
    await createReminder("Later", 60);
    await pushDueReminders();
    expect(mine()).toHaveLength(0);
  });

  it("pushes a snoozed reminder again when its new time comes", async () => {
    const id = await createReminder("Snoozed", -1);
    await pushDueReminders();
    sent.length = 0;

    await request(app)
      .patch(`/api/reminders/${id}`)
      .set(H)
      .send({ remindAt: new Date(Date.now() - 1000).toISOString() });
    await pushDueReminders();
    expect(mine().map((s) => s.payload.title)).toEqual(["Snoozed"]);
  });

  it("sends one summary when many fall due at once", async () => {
    for (const n of [1, 2, 3, 4]) await createReminder(`Batch ${n}`, -1);
    await pushDueReminders();
    expect(mine()).toHaveLength(1);
    expect(mine()[0].payload.title).toBe("4 reminders are due");
  });

  it("drops a device the push service says is gone", async () => {
    await request(app).post("/api/push/subscriptions").set(H).send(subscription(DEAD_ENDPOINT));
    failures.set(DEAD_ENDPOINT, 410);
    await createReminder("After uninstall", -1);
    await pushDueReminders();
    failures.clear();

    expect(await prisma.pushSubscription.count({ where: { endpoint: DEAD_ENDPOINT } })).toBe(0);
    // The working device still got it.
    expect(mine().map((s) => s.endpoint)).toEqual([ENDPOINT]);
  });

  it("stops pushing after unsubscribing", async () => {
    const res = await request(app).delete("/api/push/subscriptions").set(H).send({ endpoint: ENDPOINT });
    expect(res.status).toBe(204);
    await createReminder("After unsubscribe", -1);
    await pushDueReminders();
    expect(mine()).toHaveLength(0);
  });
});
