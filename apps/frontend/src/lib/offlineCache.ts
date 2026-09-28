import { isOfflineRequest } from "./offlineEntries";

/**
 * A last-known-good copy of API responses, kept in localStorage so pages
 * still have something to show while the device is offline. Every successful
 * read refreshes its copy; a read that fails for lack of a connection falls
 * back to it. Anything else (a 404, a 500) still fails as before — the cache
 * stands in for the network, not for the server's answer.
 */

const PREFIX = "logbook-cache:";

interface CachedValue<T> {
  /** Whose data this is, so one account never sees another's on a shared browser. */
  owner: string | null;
  savedAt: string;
  data: T;
}

function currentOwner(): string | null {
  return localStorage.getItem("logbook-email");
}

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CachedValue<T>;
    return cached.owner === currentOwner() ? cached.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(key: string, data: T) {
  const value: CachedValue<T> = { owner: currentOwner(), savedAt: new Date().toISOString(), data };
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the cache is best-effort, the request already succeeded.
  }
}

/** Run a read, caching its result; offline, answer from the cache when there is one. */
export async function cachedRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const data = await load();
    writeCache(key, data);
    return data;
  } catch (error) {
    if (isOfflineRequest(error)) {
      const cached = readCache<T>(key);
      if (cached !== undefined) return cached;
    }
    throw error;
  }
}

/** Drop every cached response — on sign-out, so the next account starts clean. */
export function clearOfflineCache() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
