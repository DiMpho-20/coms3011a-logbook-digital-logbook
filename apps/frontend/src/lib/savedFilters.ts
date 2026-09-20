/** A named, reusable filter combination for the Entries page. */
export interface SavedFilter {
  id: string;
  name: string;
  searchQuery: string;
  filterProjectId: string;
  filterTab: "all" | "week" | "overdue";
  sortOrder: "newest" | "oldest";
  /** Optional so older saved filters (from before tag filtering existed) still load fine. */
  selectedTags?: string[];
  createdAt: string;
}

const STORAGE_KEY = "logbook-saved-filters";

/** Load all saved filters from localStorage (empty array if none/corrupt). */
export function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist saved filters to localStorage. */
export function persistSavedFilters(filters: SavedFilter[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

/** Save the current filter state under a name. Returns the updated list. */
export function saveFilter(
  name: string,
  current: Omit<SavedFilter, "id" | "name" | "createdAt">
): SavedFilter[] {
  const filters = loadSavedFilters();
  const filter: SavedFilter = {
    ...current,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  persistSavedFilters([...filters, filter]);
  return loadSavedFilters();
}

/** Delete a saved filter by id. Returns the updated list. */
export function deleteFilter(id: string): SavedFilter[] {
  const filters = loadSavedFilters().filter((f) => f.id !== id);
  persistSavedFilters(filters);
  return filters;
}
