import { describe, it, expect } from "vitest";

import {
  loadSavedFilters,
  persistSavedFilters,
  saveFilter,
  deleteFilter,
  type SavedFilter,
} from "../savedFilters";

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

describe("saveFilter", () => {
  it("adds a new filter and returns the updated list", () => {
    const result = saveFilter("My filter", {
      searchQuery: "todo",
      filterProjectId: "",
      filterTab: "week",
      sortOrder: "oldest",
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("My filter");
    expect(result[0].searchQuery).toBe("todo");
    expect(result[0].id).toMatch(/^[\d]+-[a-z0-9]+$/);
    expect(result[0].createdAt).toBeTruthy();
  });

  it("saves and reloads selected tags", () => {
    const result = saveFilter("Tagged", {
      searchQuery: "",
      filterProjectId: "",
      filterTab: "all",
      sortOrder: "newest",
      selectedTags: ["urgent", "reading"],
    });

    expect(result[0].selectedTags).toEqual(["urgent", "reading"]);
    expect(loadSavedFilters()[0].selectedTags).toEqual(["urgent", "reading"]);
  });

  it("loads an older saved filter with no selectedTags field without error", () => {
    persistSavedFilters([seedFilter()]); // seedFilter predates tag filtering
    const [loaded] = loadSavedFilters();
    expect(loaded.selectedTags).toBeUndefined();
  });

  it("trims the filter name", () => {
    const result = saveFilter("  padded  ", {
      searchQuery: "",
      filterProjectId: "",
      filterTab: "all",
      sortOrder: "newest",
    });
    expect(result[0].name).toBe("padded");
  });

  it("preserves existing filters when adding a new one", () => {
    persistSavedFilters([seedFilter()]);
    const result = saveFilter("New one", {
      searchQuery: "x",
      filterProjectId: "",
      filterTab: "all",
      sortOrder: "newest",
    });
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name).sort()).toEqual(["New one", "Seed"]);
  });

  it("persists the filter to localStorage", () => {
    saveFilter("Persisted", {
      searchQuery: "",
      filterProjectId: "",
      filterTab: "all",
      sortOrder: "newest",
    });
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Persisted");
  });
});

describe("deleteFilter", () => {
  it("removes the filter with the matching id and returns the remainder", () => {
    persistSavedFilters([
      seedFilter({ id: "a", name: "A" }),
      seedFilter({ id: "b", name: "B" }),
    ]);

    const result = deleteFilter("a");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("leaves other filters intact when the id does not match anything", () => {
    persistSavedFilters([seedFilter({ id: "x" })]);
    const result = deleteFilter("no-such-id");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("x");
  });

  it("persists the deletion to localStorage", () => {
    persistSavedFilters([seedFilter({ id: "a" }), seedFilter({ id: "b" })]);
    deleteFilter("a");
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(parsed.map((f: SavedFilter) => f.id)).toEqual(["b"]);
  });
});
