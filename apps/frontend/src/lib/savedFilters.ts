import { api } from "../api/client";

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
  /** Custom field filters (US23). Optional for the same reason. */
  fieldFilters?: { fieldId: string; op: string; value: string }[];
  /** Whether archived entries are excluded, included or shown alone (US30). */
  archivedFilter?: "exclude" | "include" | "only";
  createdAt: string;
}

type FilterState = Omit<SavedFilter, "id" | "name" | "createdAt">;

// Filters are kept on the account (GET/POST/DELETE /saved-filters) so they
// follow the student between devices. This copy in localStorage is a cache,
// so the chips show at once and offline. A filter saved while offline, or
// before filters were kept on the account, exists only here until
// syncSavedFilters uploads it; its id is not a server id (a uuid).
const STORAGE_KEY = "logbook-saved-filters";

const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isOnAccount = (id: string) => SERVER_ID.test(id);

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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage blocked: the account still has them.
  }
}

/** True when a request failed for want of a connection, not because the server refused it. */
function isConnectionError(error: unknown): boolean {
  return !navigator.onLine || !(error as { response?: unknown })?.response;
}

function stateOf(f: SavedFilter): FilterState {
  return {
    searchQuery: f.searchQuery,
    filterProjectId: f.filterProjectId,
    filterTab: f.filterTab,
    sortOrder: f.sortOrder,
    ...(f.selectedTags && { selectedTags: f.selectedTags }),
    ...(f.fieldFilters && { fieldFilters: f.fieldFilters }),
    ...(f.archivedFilter && { archivedFilter: f.archivedFilter }),
  };
}

async function createOnAccount(name: string, state: FilterState): Promise<SavedFilter> {
  return (await api.post("/saved-filters", { name: name.trim(), filters: state })).data;
}

/**
 * Bring the cache in line with the account: upload any filter that exists
 * only on this device, then replace the cache with the account's list.
 */
export async function syncSavedFilters(): Promise<SavedFilter[]> {
  for (const local of loadSavedFilters().filter((f) => !isOnAccount(f.id))) {
    const uploaded = await createOnAccount(local.name, stateOf(local));
    // Swap it in at once, so a failure further on cannot upload it twice.
    persistSavedFilters(loadSavedFilters().map((f) => (f.id === local.id ? uploaded : f)));
  }
  const filters: SavedFilter[] = (await api.get("/saved-filters")).data;
  persistSavedFilters(filters);
  return filters;
}

/**
 * Save the current filter state under a name. Offline, it is kept on this
 * device and uploaded by the next sync. Returns the updated list.
 */
export async function saveFilter(name: string, current: FilterState): Promise<SavedFilter[]> {
  let filter: SavedFilter;
  try {
    filter = await createOnAccount(name, current);
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    filter = {
      ...current,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
  }
  persistSavedFilters([...loadSavedFilters(), filter]);
  return loadSavedFilters();
}

/** Delete a saved filter by id. Returns the updated list. */
export async function deleteFilter(id: string): Promise<SavedFilter[]> {
  if (isOnAccount(id)) {
    try {
      await api.delete(`/saved-filters/${id}`);
    } catch (error) {
      // Already gone from the account is as good as deleted.
      if ((error as { response?: { status?: number } })?.response?.status !== 404) throw error;
    }
  }
  const filters = loadSavedFilters().filter((f) => f.id !== id);
  persistSavedFilters(filters);
  return filters;
}
