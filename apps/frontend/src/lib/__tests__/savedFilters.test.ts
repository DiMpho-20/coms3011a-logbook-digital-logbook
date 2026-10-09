import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../api/client";
import {
  loadSavedFilters,
  persistSavedFilters,
  saveFilter,
  deleteFilter,
  syncSavedFilters,
  type SavedFilter,
} from "../savedFilters";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const offline = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const STORAGE_KEY = "logbook-saved-filters";

// Reusable seed filter used by multiple tests below.
function seedFilter(overrides: Partial<SavedFilter> = {}): SavedFilter {
  return {
    id: "seed-1",
    name: "Seed",
    searchQuery: "bug",
    filterProjectId: "proj-1",
    filterTab: "all",
    sortOrder: "newest",
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadSavedFilters", () => {
  it("returns an empty array when localStorage is empty", () => {
    expect(loadSavedFilters()).toEqual([]);
  });

  it("returns an empty array when localStorage has invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{{{");
    expect(loadSavedFilters()).toEqual([]);
  });

  it("returns an empty array when localStorage has a non-array value", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "not array" }));
    expect(loadSavedFilters()).toEqual([]);
  });

  it("returns the parsed array when localStorage holds valid data", () => {
    const expected = [seedFilter()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expected));
    expect(loadSavedFilters()).toEqual(expected);
  });
});

describe("persistSavedFilters", () => {
  it("writes JSON to localStorage under the correct key", () => {
    const list = [seedFilter()];
    persistSavedFilters(list);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(list));
  });
});

const state = { searchQuery: "todo", filterProjectId: "", filterTab: "week" as const, sortOrder: "oldest" as const };

describe("saveFilter", () => {
  it("saves to the account and caches what the account returns", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: seedFilter({ id: UUID_A, name: "My filter" }) });

    const result = await saveFilter("  My filter ", state);

    expect(api.post).toHaveBeenCalledWith("/saved-filters", { name: "My filter", filters: state });
    expect(result.map((f) => f.id)).toEqual([UUID_A]);
    expect(loadSavedFilters()[0].id).toBe(UUID_A);
  });

  it("keeps the filter on this device when offline", async () => {
    vi.mocked(api.post).mockRejectedValue(offline);

    const result = await saveFilter("Offline", { ...state, selectedTags: ["urgent"] });

    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^\d+-[a-z0-9]+$/);
    expect(loadSavedFilters()[0].selectedTags).toEqual(["urgent"]);
  });

  it("passes on a refusal from the server instead of hiding it", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 400 } });
    await expect(saveFilter("Bad", state)).rejects.toBeTruthy();
    expect(loadSavedFilters()).toEqual([]);
  });

  it("loads an older saved filter with no selectedTags field without error", () => {
    persistSavedFilters([seedFilter()]); // seedFilter predates tag filtering
    const [loaded] = loadSavedFilters();
    expect(loaded.selectedTags).toBeUndefined();
  });
});

describe("syncSavedFilters", () => {
  it("uploads filters saved only on this device, then caches the account's list", async () => {
    persistSavedFilters([seedFilter({ id: "1700000000-abc123", name: "Local", selectedTags: ["x"] })]);
    vi.mocked(api.post).mockResolvedValue({ data: seedFilter({ id: UUID_A, name: "Local" }) });
    vi.mocked(api.get).mockResolvedValue({ data: [seedFilter({ id: UUID_A, name: "Local" }), seedFilter({ id: UUID_B, name: "From laptop" })] });

    const result = await syncSavedFilters();

    expect(api.post).toHaveBeenCalledWith("/saved-filters", {
      name: "Local",
      filters: { searchQuery: "bug", filterProjectId: "proj-1", filterTab: "all", sortOrder: "newest", selectedTags: ["x"] },
    });
    expect(result.map((f) => f.name)).toEqual(["Local", "From laptop"]);
    expect(loadSavedFilters().map((f) => f.id)).toEqual([UUID_A, UUID_B]);
  });

  it("does not upload filters already on the account", async () => {
    persistSavedFilters([seedFilter({ id: UUID_A })]);
    vi.mocked(api.get).mockResolvedValue({ data: [seedFilter({ id: UUID_A })] });

    await syncSavedFilters();

    expect(api.post).not.toHaveBeenCalled();
  });

  it("leaves the cache alone when the account cannot be reached", async () => {
    persistSavedFilters([seedFilter({ id: UUID_A })]);
    vi.mocked(api.get).mockRejectedValue(offline);

    await expect(syncSavedFilters()).rejects.toBeTruthy();
    expect(loadSavedFilters().map((f) => f.id)).toEqual([UUID_A]);
  });
});

describe("deleteFilter", () => {
  it("deletes from the account and the cache", async () => {
    persistSavedFilters([seedFilter({ id: UUID_A, name: "A" }), seedFilter({ id: UUID_B, name: "B" })]);
    vi.mocked(api.delete).mockResolvedValue({});

    const result = await deleteFilter(UUID_A);

    expect(api.delete).toHaveBeenCalledWith(`/saved-filters/${UUID_A}`);
    expect(result.map((f) => f.id)).toEqual([UUID_B]);
    expect(loadSavedFilters().map((f) => f.id)).toEqual([UUID_B]);
  });

  it("removes a filter that only exists on this device without asking the server", async () => {
    persistSavedFilters([seedFilter({ id: "local-1" })]);
    expect(await deleteFilter("local-1")).toEqual([]);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("treats a filter already gone from the account as deleted", async () => {
    persistSavedFilters([seedFilter({ id: UUID_A })]);
    vi.mocked(api.delete).mockRejectedValue({ response: { status: 404 } });
    expect(await deleteFilter(UUID_A)).toEqual([]);
  });
});
