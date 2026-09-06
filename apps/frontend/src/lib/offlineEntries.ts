import type { CreateEntryInput, Entry } from "@logbook/shared";
import { api } from "../api/client";

const STORAGE_KEY = "logbook-pending-entries";
const SYNC_EVENT = "logbook-entries-synced";

interface PendingEntry {
  entry: Entry;
  payload: CreateEntryInput;
}

let activeSync: Promise<number> | null = null;

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

export function syncPendingEntries(): Promise<number> {
  if (activeSync) return activeSync;
  if (!navigator.onLine || !localStorage.getItem("token")) return Promise.resolve(0);

  activeSync = (async () => {
    const pending = readPending();
    let synced = 0;
    const remaining: PendingEntry[] = [];

    for (const item of pending) {
      try {
        await api.post(`/projects/${item.entry.projectId}/entries`, item.payload);
        synced++;
      } catch (error) {
        remaining.push(item);
        // A connectivity failure means later requests cannot succeed either.
        if (isOfflineRequest(error)) {
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

export function startOfflineSync() {
  void syncPendingEntries();
  const onOnline = () => { void syncPendingEntries(); };
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}

export { SYNC_EVENT };
