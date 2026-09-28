import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import prisma from "../prisma.js";
import { hashPassword } from "../utils/auth.js";
import {
  purgeExpiredDeletions,
  startDeletionPurge,
} from "../jobs/purgeDeletedAccounts.js";

// ── Fixtures ─────────────────────────────────────────────────────────────
// Account deletion is scheduled rather than immediate: DELETE /auth/account
// sets scheduledDeletionAt 30 days out, and this job is what finally erases
// the account once that date passes. It is the last unwitnessed step of that
// flow, so what matters is that it erases exactly the accounts whose grace
// period has ended and nothing else.

const ts = Date.now();
const DAY = 86_400_000;

// bcrypt is deliberately slow and every fixture here shares one password, so
// the hash is computed once rather than once per user.
let sharedHash: Promise<string> | null = null;
const fixtureHash = () => (sharedHash ??= hashPassword("Password123"));

async function makeUser(id: string, label: string, scheduledDeletionAt: Date | null) {
  await prisma.user.create({
    data: {
      id,
      email: `purge_${label}_${ts}@example.com`,
      passwordHash: await fixtureHash(),
      fullName: `Purge ${label}`,
      isEmailVerified: true,
      scheduledDeletionAt,
    },
  });
}

const expiredId = crypto.randomUUID();
const stillWaitingId = crypto.randomUUID();
const neverAskedId = crypto.randomUUID();
const CASCADE_PROJECT = `__purge_cascade_${ts}`;

let cascadeEntryId = "";
let purgedCount = 0;

describe("purgeExpiredDeletions", () => {
  beforeAll(async () => {
    await makeUser(expiredId, "expired", new Date(Date.now() - DAY));
    await makeUser(stillWaitingId, "waiting", new Date(Date.now() + 29 * DAY));
    await makeUser(neverAskedId, "never", null);

    // Something for the delete to cascade through.
    const project = await prisma.project.create({
      data: {
        userId: expiredId,
        name: CASCADE_PROJECT,
        entries: { create: [{ durationMinutes: 30 }] },
      },
      include: { entries: true },
    });
    cascadeEntryId = project.entries[0].id;

    // One sweep, its result shared by the assertions below: the job deletes
    // every expired account in the database, so sweeping once per assertion
    // would be four times the collateral for no extra coverage.
    purgedCount = await purgeExpiredDeletions();
  });

  afterAll(async () => {
    await prisma.user
      .deleteMany({ where: { id: { in: [expiredId, stillWaitingId, neverAskedId] } } })
      .catch(() => {});
  });

  it("erases an account whose grace period has ended", async () => {
    expect(await prisma.user.findUnique({ where: { id: expiredId } })).toBeNull();
  });

  it("leaves an account whose grace period is still running", async () => {
    expect(await prisma.user.findUnique({ where: { id: stillWaitingId } })).not.toBeNull();
  });

  it("leaves an account that never asked to be deleted", async () => {
    expect(await prisma.user.findUnique({ where: { id: neverAskedId } })).not.toBeNull();
  });

  it("takes the account's projects and entries with it", async () => {
    expect(await prisma.project.findFirst({ where: { name: CASCADE_PROJECT } })).toBeNull();
    expect(await prisma.logbookEntry.findUnique({ where: { id: cascadeEntryId } })).toBeNull();
  });

  it("reports how many accounts it removed", () => {
    // Deliberately a floor rather than an exact figure. Purging every expired
    // account is the job's whole point, and these suites run concurrently
    // against one shared database, so an exact count would be a race with
    // whatever another file happens to have scheduled at that moment.
    expect(purgedCount).toBeGreaterThanOrEqual(1);
  });
});

describe("startDeletionPurge", () => {
  const scheduledId = crypto.randomUUID();

  afterAll(async () => {
    await prisma.user.delete({ where: { id: scheduledId } }).catch(() => {});
  });

  it("sweeps once on startup and then repeats on the interval it was given", async () => {
    await makeUser(scheduledId, "interval", new Date(Date.now() - DAY));

    // setInterval is stubbed across the synchronous call only. The job never
    // hands back its timer handle, so a real interval could not be cleared
    // and would keep sweeping the shared database for the rest of the run.
    const scheduling = vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as never);
    try {
      startDeletionPurge(1_234);
      // Asserted before restoring: mockRestore also clears the mock's call
      // history, so the expectation would otherwise see zero calls.
      expect(scheduling).toHaveBeenCalledWith(expect.any(Function), 1_234);
    } finally {
      scheduling.mockRestore();
    }

    // The startup sweep is fired without being awaited, so its effect is what
    // has to be waited on rather than the call itself.
    await vi.waitFor(
      async () => {
        expect(await prisma.user.findUnique({ where: { id: scheduledId } })).toBeNull();
      },
      { timeout: 30_000, interval: 250 }
    );
  });
});
