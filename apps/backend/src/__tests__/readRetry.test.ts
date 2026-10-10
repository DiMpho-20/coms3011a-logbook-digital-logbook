import { describe, it, expect, vi } from "vitest";
import {
  withReadRetry,
  isTransportFailure,
  isDatabaseUnavailable,
  isRetryableRead,
  retryDelayMs,
  MAX_READ_ATTEMPTS,
} from "../utils/readRetry.js";

// The policy that decides which failed queries get a second chance. It has no
// Prisma import, so this runs without a database — which matters, because the
// thing it guards against is the database being unreachable.

const failure = (code?: string) =>
  Object.assign(new Error("boom"), code ? { code } : {});

/** No real waiting: the delays are asserted, not served. */
const noSleep = async () => {};

describe("telling a dead connection from a real answer", () => {
  it("treats transport codes as retryable", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "P1001", "P1002", "P1017"]) {
      expect(isTransportFailure(failure(code))).toBe(true);
    }
  });

  it("does not treat an answer from the database as a transport failure", () => {
    // P2002 is a unique-constraint violation: the statement arrived, ran, and
    // was rejected. Retrying it would only hide a real result.
    expect(isTransportFailure(failure("P2002"))).toBe(false);
    expect(isTransportFailure(failure("P2025"))).toBe(false);
  });

  it("does not treat an error with no code as a transport failure", () => {
    expect(isTransportFailure(failure())).toBe(false);
    expect(isTransportFailure(null)).toBe(false);
    expect(isTransportFailure("ETIMEDOUT")).toBe(false);
  });
});

describe("which operations may be run again", () => {
  it("allows the reads", () => {
    for (const operation of [
      "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
      "findMany", "count", "aggregate", "groupBy",
    ]) {
      expect(isRetryableRead(operation)).toBe(true);
    }
  });

  it("refuses every write", () => {
    // A write that timed out at the transport may still have landed, so
    // running it again could duplicate data.
    for (const operation of [
      "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany",
    ]) {
      expect(isRetryableRead(operation)).toBe(false);
    }
  });

  it("refuses raw SQL, which could be anything", () => {
    expect(isRetryableRead("$queryRawUnsafe")).toBe(false);
    expect(isRetryableRead("$executeRaw")).toBe(false);
  });
});

describe("retrying a read", () => {
  it("returns the result once a retried read succeeds", async () => {
    // The CI shape: loadHistory's findFirst dies at the transport, then works.
    const run = vi.fn()
      .mockRejectedValueOnce(failure("ETIMEDOUT"))
      .mockResolvedValue("rows");

    await expect(withReadRetry("findFirst", run, { sleep: noSleep })).resolves.toBe("rows");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up rather than retrying for ever", async () => {
    const run = vi.fn().mockRejectedValue(failure("ETIMEDOUT"));

    await expect(withReadRetry("findMany", run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(MAX_READ_ATTEMPTS);
  });

  it("runs a healthy read exactly once", async () => {
    const run = vi.fn().mockResolvedValue(42);

    await expect(withReadRetry("count", run, { sleep: noSleep })).resolves.toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("raises a real database error on the first attempt", async () => {
    const run = vi.fn().mockRejectedValue(failure("P2002"));

    await expect(withReadRetry("findFirst", run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never runs a timed-out write again", async () => {
    // The property that makes this safe to apply to every query in the app.
    const run = vi.fn().mockRejectedValue(failure("ETIMEDOUT"));

    await expect(withReadRetry("create", run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);

    run.mockClear();
    await expect(withReadRetry("upsert", run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits once per retry, for longer each time", async () => {
    const waits: number[] = [];
    const run = vi.fn()
      .mockRejectedValueOnce(failure("ETIMEDOUT"))
      .mockRejectedValueOnce(failure("ETIMEDOUT"))
      .mockResolvedValue("ok");

    await withReadRetry("findMany", run, { sleep: async (ms) => { waits.push(ms); } });

    expect(waits).toEqual([retryDelayMs(1), retryDelayMs(2)]);
  });

  it("reports each retry so a flaky link is visible rather than silent", async () => {
    const onRetry = vi.fn();
    const run = vi.fn()
      .mockRejectedValueOnce(failure("ETIMEDOUT"))
      .mockResolvedValue("rows");

    await withReadRetry("findUniqueOrThrow", run, { sleep: noSleep, onRetry });

    expect(onRetry).toHaveBeenCalledWith("findUniqueOrThrow", 1);
  });
});

describe("telling an unreachable database from a bad request", () => {
  it("counts a dead connection, a failed start-up and an exhausted pool", () => {
    expect(isDatabaseUnavailable(failure("P1001"))).toBe(true);
    expect(isDatabaseUnavailable(failure("ECONNRESET"))).toBe(true);
    expect(isDatabaseUnavailable(failure("P2024"))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error("boom"), { errorCode: "P1001" }))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error("boom"), { name: "PrismaClientInitializationError" }))).toBe(true);
  });

  it("leaves answers the database gave, and validation errors, alone", () => {
    expect(isDatabaseUnavailable(failure("P2002"))).toBe(false);
    expect(isDatabaseUnavailable(failure())).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });
});
