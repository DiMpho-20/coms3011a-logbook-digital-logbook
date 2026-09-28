import type {
  CreateEntryFieldInput,
  CreateProjectInput,
  EntryField,
  Project,
  ProjectWithFields,
  UpdateEntryFieldInput,
  UpdateProjectInput,
} from "@logbook/shared";
import { api } from "../api/client";
import {
  isOfflineRequest,
  remapPendingEntries,
  removePendingEntriesForProject,
  syncPendingEntries,
  SYNC_EVENT,
} from "./offlineEntries";
import { orderForSaving } from "./formulas";
import { readCache } from "./offlineCache";

/**
 * Projects created while offline. Each is kept on this device with a
 * temporary "offline-" id, together with the entry fields added to it, and
 * is sent to the server — project first, then its fields — the next time
 * the device is online. Entries logged against it meanwhile are queued by
 * offlineEntries as usual and follow once the project has its real id.
 */

const STORAGE_KEY = "logbook-pending-projects";
const SYNCED_IDS_KEY = "logbook-synced-ids";

interface PendingField {
  field: EntryField;
  /** Set once the server has created it, so a retry never creates it twice. */
  serverId?: string;
}

interface PendingProject {
  project: Project;
  fields: PendingField[];
  serverId?: string;
  /** Why the last sync attempt was refused, e.g. a duplicate project name. */
  lastError?: string;
}

let activeSync: Promise<number> | null = null;

export function isOfflineId(id: string): boolean {
  return id.startsWith("offline-");
}

function readPending(): PendingProject[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as PendingProject[]) : [];
  } catch {
    return [];
  }
}

function writePending(projects: PendingProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

function readSyncedIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_IDS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * The server id for a temporary id that has since synced, or the id itself.
 * A page opened on an offline project keeps working after it syncs.
 */
export function resolveSyncedId(id: string): string {
  return isOfflineId(id) ? readSyncedIds()[id] ?? id : id;
}

export function getPendingProjects(): Project[] {
  return readPending().map(({ project }) => project);
}

export function pendingProjectCount(): number {
  return readPending().length;
}

/** Projects the server refused to create, with its reason, so the user can fix them. */
export function pendingProjectErrors(): { name: string; error: string }[] {
  return readPending()
    .filter((p) => p.lastError)
    .map((p) => ({ name: p.project.name, error: p.lastError! }));
}

export function getPendingProject(id: string): ProjectWithFields | null {
  const pending = readPending().find((p) => p.project.id === id);
  return pending ? { ...pending.project, entryFields: pending.fields.map((f) => f.field) } : null;
}

export function getPendingFields(projectId: string): EntryField[] | null {
  return getPendingProject(projectId)?.entryFields ?? null;
}

/** Project names are unique per user, so a clash is caught now rather than failing on sync. */
function assertNameAvailable(name: string, exceptId?: string) {
  const key = name.trim().toLowerCase();
  const known = [...(readCache<Project[]>("projects") ?? []), ...getPendingProjects()];
  if (known.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === key)) {
    throw new Error("You already have a project with that name.");
  }
}

export function queueProject(input: CreateProjectInput): Project {
  assertNameAvailable(input.name);
  const timestamp = new Date().toISOString();
  const project: Project = {
    id: `offline-project-${crypto.randomUUID()}`,
    // Filled in by the server once the project syncs.
    userId: "",
    name: input.name.trim(),
    description: input.description ?? null,
    status: input.status ?? "ACTIVE",
    tags: input.tags ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  writePending([...readPending(), { project, fields: [] }]);
  return project;
}

export function updateQueuedProject(id: string, updates: UpdateProjectInput): Project {
  if (updates.name !== undefined) assertNameAvailable(updates.name, id);
  const pending = readPending();
  const target = pending.find((p) => p.project.id === id);
  if (!target) throw new Error("Project not found");
  target.project = {
    ...target.project,
    ...(updates.name !== undefined && { name: updates.name.trim() }),
    ...(updates.description !== undefined && { description: updates.description || null }),
    ...(updates.status !== undefined && { status: updates.status }),
    ...(updates.tags !== undefined && { tags: updates.tags }),
    updatedAt: new Date().toISOString(),
  };
  // Whatever the server objected to may be what was just fixed, so try again.
  const retry = Boolean(target.lastError) && navigator.onLine;
  target.lastError = undefined;
  writePending(pending);
  if (retry) queueMicrotask(() => { void syncEverything(); });
  return target.project;
}

/** Delete a project that never reached the server, along with the entries queued for it. */
export function removeQueuedProject(id: string) {
  writePending(readPending().filter((p) => p.project.id !== id));
  removePendingEntriesForProject(id);
}

export function queueField(projectId: string, input: CreateEntryFieldInput): EntryField {
  const pending = readPending();
  const target = pending.find((p) => p.project.id === projectId);
  if (!target) throw new Error("Project not found");
  const timestamp = new Date().toISOString();
  const field: EntryField = {
    id: `offline-field-${crypto.randomUUID()}`,
    projectId,
    name: input.name,
    type: input.type,
    required: input.required ?? false,
    // Stored with the temporary ids of the fields it reads; swapped for the
    // server's ids as each of those is created during sync.
    formula: input.formula ?? null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  target.fields.push({ field });
  writePending(pending);
  return field;
}

export function updateQueuedField(fieldId: string, updates: UpdateEntryFieldInput): EntryField {
  const pending = readPending();
  const holder = pending.flatMap((p) => p.fields).find((f) => f.field.id === fieldId);
  if (!holder) throw new Error("Field not found");
  holder.field = {
    ...holder.field,
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.type !== undefined && { type: updates.type }),
    ...(updates.required !== undefined && { required: updates.required }),
    ...(updates.formula !== undefined && { formula: updates.formula }),
    updatedAt: new Date().toISOString(),
  };
  writePending(pending);
  return holder.field;
}

export function removeQueuedField(fieldId: string) {
  const pending = readPending();
  for (const project of pending) {
    project.fields = project.fields.filter((f) => f.field.id !== fieldId);
  }
  writePending(pending);
}

function errorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { error?: unknown } } })?.response;
  const message = response?.data?.error;
  return typeof message === "string" ? message : error instanceof Error ? error.message : "The server refused this project.";
}

/**
 * Send every queued project to the server. Progress is saved after each
 * request, so a connection lost halfway picks up where it stopped instead of
 * creating the project (or any of its fields) a second time.
 */
export function syncPendingProjects(): Promise<number> {
  if (activeSync) return activeSync;
  if (!navigator.onLine || !localStorage.getItem("token")) return Promise.resolve(0);

  activeSync = (async () => {
    let synced = 0;
    for (const { project } of readPending()) {
      // Re-read each time: the previous iteration saved its progress.
      const pending = readPending();
      const item = pending.find((p) => p.project.id === project.id);
      if (!item) continue;
      const save = () => writePending(pending);

      try {
        if (!item.serverId) {
          const res = await api.post("/projects", {
            name: item.project.name,
            description: item.project.description ?? undefined,
            status: item.project.status,
            tags: item.project.tags,
          });
          item.serverId = res.data.id as string;
          save();
        }

        const ids: Record<string, string> = { [item.project.id]: item.serverId! };
        item.fields.forEach((f) => { if (f.serverId) ids[f.field.id] = f.serverId; });

        // Every field a formula reads goes first, so its id is known by then.
        for (const field of orderForSaving(item.fields.map((f) => f.field))) {
          const holder = item.fields.find((f) => f.field.id === field.id)!;
          if (holder.serverId) continue;
          const formula = field.formula
            ? field.formula.replace(/\{([^{}]*)\}/g, (match, id: string) => (ids[id] ? `{${ids[id]}}` : match))
            : undefined;
          const res = await api.post(`/projects/${item.serverId}/entry-fields`, {
            name: field.name,
            type: field.type,
            required: field.required,
            formula,
          });
          holder.serverId = res.data.id as string;
          ids[field.id] = holder.serverId;
          save();
        }

        localStorage.setItem(SYNCED_IDS_KEY, JSON.stringify({ ...readSyncedIds(), ...ids }));
        remapPendingEntries(ids);
        writePending(readPending().filter((p) => p.project.id !== item.project.id));
        synced++;
      } catch (error) {
        // A connectivity failure means the rest can't succeed either.
        if (isOfflineRequest(error)) break;
        item.lastError = errorMessage(error);
        save();
      }
    }
    return synced;
  })().finally(() => { activeSync = null; });

  return activeSync;
}

/** Projects go first so entries logged against them have a real project id to go to. */
export async function syncEverything(): Promise<void> {
  await syncPendingProjects();
  await syncPendingEntries();
}

export function startFullOfflineSync() {
  void syncEverything();
  const onOnline = () => { void syncEverything(); };
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
