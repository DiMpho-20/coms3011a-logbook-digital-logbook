import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../api/client";
import {
  getPendingProject,
  getPendingProjects,
  pendingProjectCount,
  pendingProjectErrors,
  queueField,
  queueProject,
  removeQueuedField,
  removeQueuedProject,
  resolveSyncedId,
  startFullOfflineSync,
  syncEverything,
  syncPendingProjects,
  updateQueuedField,
  updateQueuedProject,
} from "../offlineProjects";
import { getPendingEntries, queueEntry } from "../offlineEntries";
import { writeCache } from "../offlineCache";

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

const networkError = { code: "ERR_NETWORK", message: "Network Error" };
const post = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setOnline(true);
  localStorage.setItem("token", "a-token");
});

afterEach(() => {
  setOnline(true);
});

describe("queueing a project offline", () => {
  it("keeps it on the device with a temporary id", () => {
    const project = queueProject({ name: "Field trip", description: "Notes", tags: ["geo"] });
    expect(project.id.startsWith("offline-")).toBe(true);
    expect(project.status).toBe("ACTIVE");
    expect(getPendingProjects()).toEqual([project]);
    expect(pendingProjectCount()).toBe(1);
  });

  it("refuses a name already used by a cached or queued project", () => {
    writeCache("projects", [{ id: "p1", name: "Thesis" }]);
    expect(() => queueProject({ name: " thesis " })).toThrow(/already have a project/);
    queueProject({ name: "Lab" });
    expect(() => queueProject({ name: "LAB" })).toThrow(/already have a project/);
  });

  it("holds fields added to it, and lets them be edited or removed", () => {
    const project = queueProject({ name: "Survey" });
    const field = queueField(project.id, { name: "Count", type: "NUMBER", required: true });
    expect(getPendingProject(project.id)?.entryFields).toEqual([field]);

    updateQueuedField(field.id, { name: "Total" });
    expect(getPendingProject(project.id)?.entryFields[0].name).toBe("Total");

    removeQueuedField(field.id);
    expect(getPendingProject(project.id)?.entryFields).toEqual([]);
  });

  it("deletes a queued project together with the entries queued for it", () => {
    const doomed = queueProject({ name: "Doomed" });
    const kept = queueProject({ name: "Kept" });
    queueEntry(doomed.id, { durationMinutes: 1, values: {} });
    queueEntry(kept.id, { durationMinutes: 2, values: {} });

    removeQueuedProject(doomed.id);
    expect(getPendingProjects().map((p) => p.name)).toEqual(["Kept"]);
    expect(getPendingEntries().map((e) => e.projectId)).toEqual([kept.id]);
  });

  it("applies edits to the queued project", () => {
    const project = queueProject({ name: "Draft" });
    updateQueuedProject(project.id, { name: "Final", status: "ARCHIVED" });
    expect(getPendingProjects()[0]).toMatchObject({ name: "Final", status: "ARCHIVED" });
  });
});

describe("syncing queued projects", () => {
  it("creates the project, then its fields with formulas pointing at the new ids", async () => {
    const project = queueProject({ name: "Hours" });
    const hours = queueField(project.id, { name: "Hours", type: "NUMBER", required: true });
    queueField(project.id, { name: "Double", type: "COMPUTED", required: true, formula: `{${hours.id}} * 2` });

    post
      .mockResolvedValueOnce({ data: { id: "srv-project" } })
      .mockResolvedValueOnce({ data: { id: "srv-hours" } })
      .mockResolvedValueOnce({ data: { id: "srv-double" } });

    expect(await syncPendingProjects()).toBe(1);
    expect(post).toHaveBeenNthCalledWith(1, "/projects", expect.objectContaining({ name: "Hours" }));
    expect(post).toHaveBeenNthCalledWith(2, "/projects/srv-project/entry-fields", expect.objectContaining({ name: "Hours" }));
    expect(post).toHaveBeenNthCalledWith(3, "/projects/srv-project/entry-fields", expect.objectContaining({ formula: "{srv-hours} * 2" }));
    expect(pendingProjectCount()).toBe(0);
    expect(resolveSyncedId(project.id)).toBe("srv-project");
    expect(resolveSyncedId(hours.id)).toBe("srv-hours");
  });

  it("moves entries logged against it onto the real project and field ids", async () => {
    const project = queueProject({ name: "Diary" });
    const note = queueField(project.id, { name: "Note", type: "TEXT" });
    queueEntry(project.id, { durationMinutes: 10, values: { [note.id]: "hello" } });

    post
      .mockResolvedValueOnce({ data: { id: "srv-diary" } })
      .mockResolvedValueOnce({ data: { id: "srv-note" } })
      .mockResolvedValueOnce({ data: { id: "srv-entry" } });

    await syncEverything();
    expect(post).toHaveBeenLastCalledWith("/projects/srv-diary/entries", { durationMinutes: 10, values: { "srv-note": "hello" } });
    expect(getPendingEntries()).toEqual([]);
  });

  it("does not send an entry while its project is still unsynced", async () => {
    const project = queueProject({ name: "Waiting" });
    queueEntry(project.id, { durationMinutes: 1, values: {} });
    post.mockRejectedValueOnce(networkError);

    await syncEverything();
    expect(post).toHaveBeenCalledTimes(1);
    expect(getPendingEntries()).toHaveLength(1);
    expect(pendingProjectCount()).toBe(1);
  });

  it("resumes where it stopped instead of creating the project twice", async () => {
    const project = queueProject({ name: "Resume" });
    queueField(project.id, { name: "Note", type: "TEXT" });
    post.mockResolvedValueOnce({ data: { id: "srv-resume" } }).mockRejectedValueOnce(networkError);
    await syncPendingProjects();
    expect(pendingProjectCount()).toBe(1);

    post.mockResolvedValueOnce({ data: { id: "srv-field" } });
    await syncPendingProjects();
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls.filter(([url]) => url === "/projects")).toHaveLength(1);
    expect(pendingProjectCount()).toBe(0);
  });

  it("keeps a project the server refuses, with the reason", async () => {
    queueProject({ name: "Taken" });
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: "A project with this name already exists." } }, code: "ERR_BAD_REQUEST" });
    await syncPendingProjects();
    expect(pendingProjectCount()).toBe(1);
    expect(pendingProjectErrors()).toEqual([{ name: "Taken", error: "A project with this name already exists." }]);
  });

  it("does nothing offline or signed out", async () => {
    queueProject({ name: "Later" });
    setOnline(false);
    expect(await syncPendingProjects()).toBe(0);
    setOnline(true);
    localStorage.removeItem("token");
    expect(await syncPendingProjects()).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("syncing after reconnecting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps retrying when the first attempt cannot reach the server", async () => {
    vi.useFakeTimers();
    queueProject({ name: "Made offline" });
    post.mockRejectedValueOnce(networkError).mockResolvedValueOnce({ data: { id: "srv-later" } });

    const stop = startFullOfflineSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(pendingProjectCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(pendingProjectCount()).toBe(0);
    expect(post).toHaveBeenCalledTimes(2);
    stop();
  });

  it("retries when the server answers that it can't handle it yet", async () => {
    vi.useFakeTimers();
    queueProject({ name: "Server waking" });
    post
      .mockRejectedValueOnce({ response: { status: 503, data: { error: "Try again shortly." } }, code: "ERR_BAD_RESPONSE" })
      .mockResolvedValueOnce({ data: { id: "srv-awake" } });

    const stop = startFullOfflineSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(pendingProjectCount()).toBe(1);
    expect(pendingProjectErrors()).toEqual([]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(pendingProjectCount()).toBe(0);
    stop();
  });

  it("does not retry a project the server refused", async () => {
    vi.useFakeTimers();
    queueProject({ name: "Taken" });
    post.mockRejectedValue({ response: { status: 409, data: { error: "Taken." } }, code: "ERR_BAD_REQUEST" });

    const stop = startFullOfflineSync();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(post).toHaveBeenCalledTimes(1);
    stop();
    post.mockReset();
  });

  it("stops retrying once stopped", async () => {
    vi.useFakeTimers();
    queueProject({ name: "Never reaches" });
    post.mockRejectedValue(networkError);

    const stop = startFullOfflineSync();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(post).toHaveBeenCalledTimes(1);
    post.mockReset();
  });
});
