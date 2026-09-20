import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../api/client";
import {
  getPendingEntries,
  pendingEntryCount,
  queueEntry,
  isOfflineRequest,
  syncPendingEntries,
  startOfflineSync,
  SYNC_EVENT,
} from "../offlineEntries";

const STORAGE_KEY = "logbook-pending-entries";

/** jsdom does not always expose crypto.randomUUID, which queueEntry needs. */
if (!globalThis.crypto?.randomUUID) {
  let n = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: { ...globalThis.crypto, randomUUID: () => `uuid-${++n}` },
    configurable: true,
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

/** An axios-shaped connectivity failure: no response, but a code. */
const networkError = { code: "ERR_NETWORK", message: "Network Error" };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setOnline(true);
  localStorage.setItem("token", "a-token");
});

afterEach(() => {
  setOnline(true);
});

describe("queueEntry", () => {
  it("stores an entry and returns it with offline defaults", () => {
    const entry = queueEntry("p1", { durationMinutes: 30, values: { f1: "hello" } });

    expect(entry.id).toMatch(/^offline-/);
    expect(entry.projectId).toBe("p1");
    expect(entry.durationMinutes).toBe(30);
    expect(entry.status).toBe("OPEN");
    expect(entry.completedAt).toBeNull();
    // The server writes the immutable snapshot when this syncs.
    expect(entry.format).toBeNull();
    expect(entry.tags).toEqual([]);
    expect(pendingEntryCount()).toBe(1);
  });

  it("keeps the dates and tags it was given", () => {
    const entry = queueEntry("p1", {
      durationMinutes: 0,
      values: {},
      entryDate: "2026-03-01",
      dueDate: "2026-03-08",
      tags: ["coursework"],
    });

    expect(entry.entryDate).toBe("2026-03-01");
    expect(entry.dueDate).toBe("2026-03-08");
    expect(entry.tags).toEqual(["coursework"]);
  });

  it("announces the change so the offline banner can update", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_EVENT, listener);
    queueEntry("p1", { durationMinutes: 1, values: {} });
    window.removeEventListener(SYNC_EVENT, listener);

    expect(listener).toHaveBeenCalled();
  });
});

describe("getPendingEntries", () => {
  it("returns everything when no project is named, and filters when one is", () => {
    queueEntry("p1", { durationMinutes: 1, values: {} });
    queueEntry("p2", { durationMinutes: 2, values: {} });

    expect(getPendingEntries()).toHaveLength(2);
    expect(getPendingEntries("p1")).toHaveLength(1);
    expect(getPendingEntries("p1")[0].projectId).toBe("p1");
    expect(getPendingEntries("nope")).toEqual([]);
  });

  it("survives a corrupted queue rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(getPendingEntries()).toEqual([]);
    expect(pendingEntryCount()).toBe(0);
  });
});

describe("isOfflineRequest", () => {
  it("is true whenever the browser reports itself offline", () => {
    setOnline(false);
    expect(isOfflineRequest({ response: { status: 500 } })).toBe(true);
  });

  it("is true for a transport error with no response", () => {
    expect(isOfflineRequest(networkError)).toBe(true);
  });

  it("is false for a server that answered", () => {
    expect(isOfflineRequest({ response: { status: 400 }, code: "ERR_BAD_REQUEST" })).toBe(false);
  });

  it("is false for an error carrying neither a response nor a code", () => {
    expect(isOfflineRequest(new Error("something else"))).toBe(false);
  });
});

describe("syncPendingEntries", () => {
  it("does nothing while offline", async () => {
    setOnline(false);
    queueEntry("p1", { durationMinutes: 1, values: {} });

    expect(await syncPendingEntries()).toBe(0);
    expect(api.post).not.toHaveBeenCalled();
    expect(pendingEntryCount()).toBe(1);
  });

  it("does nothing when nobody is signed in", async () => {
    localStorage.removeItem("token");
    queueEntry("p1", { durationMinutes: 1, values: {} });

    expect(await syncPendingEntries()).toBe(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("posts each queued entry and empties the queue", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
    queueEntry("p1", { durationMinutes: 1, values: { f: "a" } });
    queueEntry("p2", { durationMinutes: 2, values: { f: "b" } });

    expect(await syncPendingEntries()).toBe(2);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledWith("/projects/p1/entries", expect.objectContaining({ durationMinutes: 1 }));
    expect(pendingEntryCount()).toBe(0);
  });

  it("keeps an entry the server rejected and syncs the rest", async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce({ response: { status: 400 } })
      .mockResolvedValueOnce({ data: {} } as never);
    queueEntry("p1", { durationMinutes: 1, values: {} });
    queueEntry("p2", { durationMinutes: 2, values: {} });

    expect(await syncPendingEntries()).toBe(1);
    const left = getPendingEntries();
    expect(left).toHaveLength(1);
    expect(left[0].projectId).toBe("p1");
  });

  it("stops at the first connectivity failure and keeps everything after it", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: {} } as never)
      .mockRejectedValueOnce(networkError);
    queueEntry("p1", { durationMinutes: 1, values: {} });
    queueEntry("p2", { durationMinutes: 2, values: {} });
    queueEntry("p3", { durationMinutes: 3, values: {} });

    expect(await syncPendingEntries()).toBe(1);
    // The connection is gone, so the third was never attempted.
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(getPendingEntries().map((e) => e.projectId)).toEqual(["p2", "p3"]);
  });

  it("shares one in-flight sync between concurrent callers", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
    queueEntry("p1", { durationMinutes: 1, values: {} });

    const [a, b] = await Promise.all([syncPendingEntries(), syncPendingEntries()]);

    expect(a).toBe(b);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("startOfflineSync", () => {
  it("syncs on start and again when the connection returns, then detaches", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const stop = startOfflineSync();
    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));

    queueEntry("p1", { durationMinutes: 1, values: {} });
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());

    stop();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
