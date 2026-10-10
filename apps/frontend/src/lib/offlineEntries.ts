import type { CreateEntryInput, Entry } from "@logbook/shared";
import { api } from "../api/client";

const STORAGE_KEY = "logbook-pending-entries";
const SYNC_EVENT = "logbook-entries-synced";

interface PendingEntry {
  entry: Entry;
  payload: CreateEntryInput;
}

let activeSync: Promise<number> | null = null;
let interrupted = false;

function readPending(): PendingEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as PendingEntry[] : [];
  } catch {
    return [];
  }
}

function writePending(entries: PendingEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function getPendingEntries(projectId?: string): Entry[] {
  return readPending()
    .map(({ entry }) => entry)
    .filter((entry) => !projectId || entry.projectId === projectId);
}

export function pendingEntryCount(): number {
  return readPending().length;
}

export function queueEntry(projectId: string, payload: CreateEntryInput): Entry {
  const timestamp = new Date().toISOString();
  const entry: Entry = {
    id: `offline-${crypto.randomUUID()}`,
    projectId,
    durationMinutes: payload.durationMinutes,
    entryDate: payload.entryDate ?? null,
    dueDate: payload.dueDate ?? null,
    values: payload.values,
    // The server creates the immutable format snapshot once this entry syncs.
    format: null,
    tags: payload.tags ?? [],
    // Offline entries start as OPEN; the server assigns the real status on sync.
    status: "OPEN",
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  writePending([...readPending(), { entry, payload }]);
  return entry;
}

export function isOfflineRequest(error: unknown): boolean {
  const axiosError = error as { response?: unknown; code?: string };
  return !navigator.onLine || (!axiosError.response && Boolean(axiosError.code));
}

/** Whether the last sync stopped on a lost connection, leaving entries a retry could send. */
export function entrySyncInterrupted(): boolean {
  return interrupted;
}

/**
 * A sync failure worth retrying: the request never got an answer, or the
 * server answered that it could not handle it right now (it is down, waking
 * up, or cannot reach its database) rather than that the data was wrong.
 */
export function isTemporaryFailure(error: unknown): boolean {
  if (isOfflineRequest(error)) return true;
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status !== undefined && (status >= 500 || status === 408 || status === 429);
}

export function syncPendingEntries(): Promise<number> {
  if (activeSync) return activeSync;
  if (!navigator.onLine || !localStorage.getItem("token")) return Promise.resolve(0);

  activeSync = (async () => {
    interrupted = false;
    const pending = readPending();
    let synced = 0;
    const remaining: PendingEntry[] = [];

    for (const item of pending) {
      // Its project was also created offline and hasn't reached the server
      // yet; the entry waits until remapPendingEntries gives it the real id.
      if (item.entry.projectId.startsWith("offline-")) {
        remaining.push(item);
        continue;
      }
      try {
        await api.post(`/projects/${item.entry.projectId}/entries`, item.payload);
        synced++;
      } catch (error) {
        remaining.push(item);
        // A connectivity failure means later requests cannot succeed either.
        if (isTemporaryFailure(error)) {
          interrupted = true;
          remaining.push(...pending.slice(synced + remaining.length));
          break;
        }
      }
    }
    writePending(remaining);
    return synced;
  })().finally(() => { activeSync = null; });

  return activeSync;
}

/**
 * Once a project created offline has synced, its queued entries still point
 * at the temporary project and field ids. `ids` maps each temporary id to
 * the one the server assigned, and is applied to both.
 */
export function remapPendingEntries(ids: Record<string, string>) {
  const pending = readPending();
  let changed = false;
  const remapped = pending.map((item) => {
    const projectId = ids[item.entry.projectId];
    if (!projectId) return item;
    changed = true;
    const values = Object.fromEntries(
      Object.entries(item.payload.values).map(([fieldId, value]) => [ids[fieldId] ?? fieldId, value])
    );
    return {
      entry: { ...item.entry, projectId, values },
      payload: { ...item.payload, values },
    };
  });
  if (changed) writePending(remapped);
}

/** Drop every queued entry for a project that has been deleted. */
export function removePendingEntriesForProject(projectId: string) {
  const pending = readPending();
  const remaining = pending.filter((item) => item.entry.projectId !== projectId);
  if (remaining.length !== pending.length) writePending(remaining);
}

export function startOfflineSync() {
  void syncPendingEntries();
  const onOnline = () => { void syncPendingEntries(); };
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}

export { SYNC_EVENT };
