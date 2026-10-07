import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from "../api/client";
import {
  fetchProjects,
  fetchProject,
  createProject,
  updateProject,
  toggleProjectStatus,
  fetchProjectTimeSummary,
  fetchAllProjectTimeSummaries,
  createEntryField,
  fetchEntryFields,
  updateEntryField,
  deleteEntryField,
  fetchEntryFormatVersions,
  fetchTags,
  deleteTag,
  fetchEntries,
  fetchAllEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  exportLogbook,
  importLogbook,
} from "../api";
import { queueEntry, getPendingEntries } from "../lib/offlineEntries";
import { queueProject } from "../lib/offlineProjects";

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
const ok = (data: unknown) => ({ data }) as never;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setOnline(true);
});

// ── Straightforward pass-throughs ────────────────────────────────────────

describe("project and field requests", () => {
  it("reads and writes projects", async () => {
    vi.mocked(api.get).mockResolvedValue(ok([{ id: "p1" }]));
    expect(await fetchProjects()).toEqual([{ id: "p1" }]);
    expect(api.get).toHaveBeenCalledWith("/projects");

    vi.mocked(api.get).mockResolvedValue(ok({ id: "p1", entryFields: [] }));
    expect(await fetchProject("p1")).toMatchObject({ id: "p1" });

    vi.mocked(api.post).mockResolvedValue(ok({ id: "p2", name: "New" }));
    expect(await createProject({ name: "New" })).toMatchObject({ name: "New" });
    expect(api.post).toHaveBeenCalledWith("/projects", { name: "New" });

    vi.mocked(api.put).mockResolvedValue(ok({ id: "p1", name: "Renamed" }));
    expect(await updateProject("p1", { name: "Renamed" })).toMatchObject({ name: "Renamed" });
  });

  it("toggles a project's status and reads its time summary", async () => {
    vi.mocked(api.patch).mockResolvedValue(ok({ id: "p1", status: "ARCHIVED" }));
    expect(await toggleProjectStatus("p1", "ARCHIVED")).toMatchObject({ status: "ARCHIVED" });

    vi.mocked(api.get).mockResolvedValue(ok({ projectId: "p1", totalMinutes: 90 }));
    expect(await fetchProjectTimeSummary("p1")).toMatchObject({ totalMinutes: 90 });
  });

  it("reads every time summary in one request, appending queued projects", async () => {
    vi.mocked(api.get).mockResolvedValue(
      ok([{ projectId: "p1", totalMinutes: 90, totalHours: 1.5, entryCount: 2, lastEntryAt: null }])
    );
    // A project that exists only on this device is not in the server's list;
    // its summary is computed from the entries queued alongside it.
    const queued = queueProject({ name: "Field work" });
    queueEntry(queued.id, { durationMinutes: 15, values: {} });

    expect(await fetchAllProjectTimeSummaries()).toEqual([
      { projectId: "p1", totalMinutes: 90, totalHours: 1.5, entryCount: 2, lastEntryAt: null },
      expect.objectContaining({ projectId: queued.id, totalMinutes: 15, entryCount: 1 }),
    ]);
    expect(api.get).toHaveBeenCalledWith("/projects/time-summaries");
  });

  it("manages entry fields and format versions", async () => {
    vi.mocked(api.post).mockResolvedValue(ok({ id: "f1", name: "Hours" }));
    expect(await createEntryField("p1", { name: "Hours", type: "NUMBER", required: false }))
      .toMatchObject({ name: "Hours" });

    vi.mocked(api.get).mockResolvedValue(ok([{ id: "f1" }]));
    expect(await fetchEntryFields("p1")).toHaveLength(1);

    vi.mocked(api.put).mockResolvedValue(ok({ id: "f1", name: "Hours spent" }));
    expect(await updateEntryField("f1", { name: "Hours spent" })).toMatchObject({ name: "Hours spent" });

    vi.mocked(api.delete).mockResolvedValue(ok(undefined));
    await deleteEntryField("f1");
    expect(api.delete).toHaveBeenCalledWith("/entry-fields/f1");

    vi.mocked(api.get).mockResolvedValue(ok([{ version: 2 }]));
    expect(await fetchEntryFormatVersions("p1")).toEqual([{ version: 2 }]);
  });

  it("reads and deletes tags", async () => {
    vi.mocked(api.get).mockResolvedValue(ok([{ id: "t1", name: "urgent" }]));
    expect(await fetchTags()).toHaveLength(1);

    vi.mocked(api.delete).mockResolvedValue(ok(undefined));
    await deleteTag("t1");
    expect(api.delete).toHaveBeenCalledWith("/tags/t1");
  });

  it("updates and deletes entries", async () => {
    vi.mocked(api.put).mockResolvedValue(ok({ id: "e1", durationMinutes: 45 }));
    expect(await updateEntry("e1", { durationMinutes: 45 })).toMatchObject({ durationMinutes: 45 });

    vi.mocked(api.delete).mockResolvedValue(ok(undefined));
    await deleteEntry("e1");
    expect(api.delete).toHaveBeenCalledWith("/entries/e1");
  });
});

// ── The offline seam ─────────────────────────────────────────────────────

describe("fetchEntries and the offline queue", () => {
  it("appends this project's queued entries to what the server returned", async () => {
    queueEntry("p1", { durationMinutes: 5, values: {} });
    queueEntry("p2", { durationMinutes: 6, values: {} });
    vi.mocked(api.get).mockResolvedValue(ok([{ id: "server-1", projectId: "p1" }]));

    const entries = await fetchEntries("p1");

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("server-1");
    expect(entries[1].id).toMatch(/^offline-/);
  });

  it("falls back to the queue when the request cannot reach the server", async () => {
    queueEntry("p1", { durationMinutes: 5, values: {} });
    vi.mocked(api.get).mockRejectedValue(networkError);

    const entries = await fetchEntries("p1");
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toMatch(/^offline-/);
  });

  it("rethrows an error the server actually answered with", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 500 } });
    await expect(fetchEntries("p1")).rejects.toMatchObject({ response: { status: 500 } });
  });
});

describe("createEntry", () => {
  it("queues rather than posting while offline", async () => {
    setOnline(false);
    const entry = await createEntry("p1", { durationMinutes: 10, values: {} });

    expect(entry.id).toMatch(/^offline-/);
    expect(api.post).not.toHaveBeenCalled();
    expect(getPendingEntries("p1")).toHaveLength(1);
  });

  it("posts when online", async () => {
    vi.mocked(api.post).mockResolvedValue(ok({ id: "e9" }));
    expect(await createEntry("p1", { durationMinutes: 10, values: {} })).toMatchObject({ id: "e9" });
    expect(getPendingEntries()).toHaveLength(0);
  });

  it("queues when the post fails for want of a connection", async () => {
    vi.mocked(api.post).mockRejectedValue(networkError);
    const entry = await createEntry("p1", { durationMinutes: 10, values: {} });

    expect(entry.id).toMatch(/^offline-/);
    expect(getPendingEntries("p1")).toHaveLength(1);
  });

  it("rethrows a genuine server rejection instead of queueing it", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 400 } });
    await expect(createEntry("p1", { durationMinutes: 10, values: {} })).rejects.toBeTruthy();
    expect(getPendingEntries()).toHaveLength(0);
  });
});

// ── The user-scoped listing ──────────────────────────────────────────────

describe("fetchAllEntries", () => {
  const listing = {
    entries: [
      { id: "e1", projectId: "p1", formatVersionId: "v1", values: {} },
      { id: "e2", projectId: "p1", formatVersionId: "v1", values: {} },
      { id: "e3", projectId: "p2", formatVersionId: null, values: {} },
    ],
    formats: { v1: { version: 3, fields: [{ id: "f1", name: "Hours", type: "NUMBER", required: false }] } },
    limit: 200,
    truncated: false,
  };

  it("reattaches each entry's format from the shared map", async () => {
    vi.mocked(api.get).mockResolvedValue(ok(listing));
    const result = await fetchAllEntries();

    expect(api.get).toHaveBeenCalledWith("/entries", { params: {} });
    expect(result.entries[0].format).toMatchObject({ version: 3 });
    expect(result.entries[1].format).toMatchObject({ version: 3 });
    // An entry predating format versioning keeps a null format.
    expect(result.entries[2].format).toBeNull();
    expect(result.entries[0]).not.toHaveProperty("formatVersionId");
  });

  it("derives each project's fields from the newest snapshot it saw", async () => {
    vi.mocked(api.get).mockResolvedValue(ok({
      ...listing,
      entries: [
        { id: "e1", projectId: "p1", formatVersionId: "old", values: {} },
        { id: "e2", projectId: "p1", formatVersionId: "new", values: {} },
      ],
      formats: {
        old: { version: 1, fields: [{ id: "f1", name: "Old" }] },
        new: { version: 4, fields: [{ id: "f2", name: "New" }] },
      },
    }));

    const result = await fetchAllEntries();
    expect(result.fieldsByProject.p1[0].name).toBe("New");
  });

  it("names only the projects that need a live field list", async () => {
    vi.mocked(api.get).mockResolvedValue(ok(listing));
    const result = await fetchAllEntries();

    // p1's entries carry snapshots; p2's does not.
    expect(result.projectsNeedingFields).toEqual(["p2"]);
  });

  it("passes the query through and reports truncation", async () => {
    vi.mocked(api.get).mockResolvedValue(ok({ ...listing, truncated: true }));
    const result = await fetchAllEntries({ projectStatus: "ACTIVE", limit: 500 });

    expect(api.get).toHaveBeenCalledWith("/entries", { params: { projectStatus: "ACTIVE", limit: 500 } });
    expect(result.truncated).toBe(true);
  });

  it("appends queued entries, restricted to the projects the caller is showing", async () => {
    queueEntry("p1", { durationMinutes: 1, values: {} });
    queueEntry("archived", { durationMinutes: 2, values: {} });
    vi.mocked(api.get).mockResolvedValue(ok({ ...listing, entries: [], formats: {} }));

    const scoped = await fetchAllEntries({}, { pendingProjectIds: ["p1"] });
    expect(scoped.entries).toHaveLength(1);
    expect(scoped.entries[0].projectId).toBe("p1");
    expect(scoped.projectsNeedingFields).toEqual(["p1"]);

    const unscoped = await fetchAllEntries();
    expect(unscoped.entries).toHaveLength(2);
  });

  it("falls back to the queue when the server cannot be reached", async () => {
    queueEntry("p1", { durationMinutes: 1, values: {} });
    vi.mocked(api.get).mockRejectedValue(networkError);

    const result = await fetchAllEntries({}, { pendingProjectIds: ["p1"] });
    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(result.projectsNeedingFields).toEqual(["p1"]);
  });

  it("rethrows a server error", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 500 } });
    await expect(fetchAllEntries()).rejects.toBeTruthy();
  });
});

// ── Backup and restore ───────────────────────────────────────────────────

const backup = {
  format: "digital-logbook-backup",
  version: 1,
  exportedAt: "2026-09-01T00:00:00.000Z",
  projects: [
    {
      name: "Imported",
      description: null,
      status: "ACTIVE",
      fields: [{ id: "old-f1", name: "Summary", type: "TEXT", required: false }],
      entries: [{ durationMinutes: 30, entryDate: null, dueDate: null, values: { "old-f1": "did a thing" } }],
    },
  ],
};

describe("exportLogbook", () => {
  it("collects every project with its fields and entries", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/projects") return Promise.resolve(ok([{ id: "p1", name: "Alpha", description: null, status: "ACTIVE" }]));
      if (url.endsWith("/entry-fields")) return Promise.resolve(ok([{ id: "f1", name: "Summary", type: "TEXT", required: true, formula: null }]));
      return Promise.resolve(ok([{
        id: "e1", durationMinutes: 30, entryDate: null, dueDate: null, values: {},
        status: "DONE", tags: ["exam"], archivedAt: "2026-09-02T00:00:00.000Z",
      }]));
    });

    const result = await exportLogbook();

    expect(result.format).toBe("digital-logbook-backup");
    expect(result.version).toBe(1);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].fields[0]).toEqual({ id: "f1", name: "Summary", type: "TEXT", required: true, formula: null });
    expect(result.projects[0].entries[0]).toEqual({
      durationMinutes: 30, entryDate: null, dueDate: null, values: {}, status: "DONE", tags: ["exam"], archived: true,
    });
  });

  it("includes archived entries", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/projects") return Promise.resolve(ok([{ id: "p1", name: "Alpha", description: null, status: "ACTIVE" }]));
      if (url.endsWith("/entry-fields")) return Promise.resolve(ok([]));
      return Promise.resolve(ok([]));
    });

    await exportLogbook();

    expect(api.get).toHaveBeenCalledWith("/projects/p1/entries", { params: { archived: "include" } });
  });
});

describe("importLogbook", () => {
  it("refuses anything that is not a backup", async () => {
    for (const bad of [null, "nope", {}, { format: "something-else" }, { ...backup, version: 2 }]) {
      await expect(importLogbook(bad)).rejects.toThrow(/not a valid/i);
    }
  });

  it("refuses a backup whose entries are malformed", async () => {
    const broken = { ...backup, projects: [{ ...backup.projects[0], entries: [{ durationMinutes: -1, entryDate: null, dueDate: null, values: {} }] }] };
    await expect(importLogbook(broken)).rejects.toThrow(/not a valid/i);
  });

  it("refuses to run while offline", async () => {
    setOnline(false);
    await expect(importLogbook(backup)).rejects.toThrow(/internet/i);
  });

  it("sends the whole backup in one request and reports what the server imported (issue #87)", async () => {
    vi.mocked(api.post).mockResolvedValue(ok({ projects: 1, entries: 1 }));

    await expect(importLogbook(backup)).resolves.toEqual({ projects: 1, entries: 1 });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/import", backup);
  });

  it("passes on the server's explanation when the import is refused", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: "An entry in \"Imported\" is invalid. Nothing was imported." } } });

    await expect(importLogbook(backup)).rejects.toThrow(/Nothing was imported/);
  });

  it("says nothing was imported when the request fails without an explanation", async () => {
    vi.mocked(api.post).mockRejectedValue(networkError);

    await expect(importLogbook(backup)).rejects.toThrow(/Nothing was imported, so it is safe to try again/);
  });

  it("accepts a backup that uses a newer field type", async () => {
    const withTags = {
      ...backup,
      projects: [{
        ...backup.projects[0],
        fields: [{ id: "old-f1", name: "Topics", type: "TAGS", required: false, formula: null }],
        entries: [],
      }],
    };
    vi.mocked(api.post).mockResolvedValue(ok({ projects: 1, entries: 0 }));

    await expect(importLogbook(withTags)).resolves.toEqual({ projects: 1, entries: 0 });
  });
});
