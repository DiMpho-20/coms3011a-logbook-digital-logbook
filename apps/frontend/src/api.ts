import type {
  Project,
  ProjectWithFields,
  EntryField,
  EntryFieldValue,
  Entry,
  TimeSummary,
  ProjectStatus,
  CreateProjectInput,
  UpdateProjectInput,
  CreateEntryInput,
  UpdateEntryInput,
  CreateEntryFieldInput,
  UpdateEntryFieldInput,
  EntryFieldType,
  RecurrencePattern,
  ChecklistItem,
  Tag,
  ArchivedFilter,
  EntryAtDate,
  EntryHistory,
  EntrySnapshot,
  EntryVersion,
  Reminder,
  ReminderSettings,
  ReminderStatusFilter,
  CreateReminderInput,
  UpdateReminderInput,
  CustomStatistic,
} from "@logbook/shared";
import { api } from "./api/client";
import { getPendingEntries, isOfflineRequest, queueEntry, removePendingEntriesForProject } from "./lib/offlineEntries";
import { orderForSaving } from "./lib/formulas";
import { cachedRequest } from "./lib/offlineCache";
import {
  getPendingFields,
  getPendingProject,
  getPendingProjects,
  isOfflineId,
  queueField,
  queueProject,
  removeQueuedField,
  removeQueuedProject,
  resolveSyncedId,
  updateQueuedField,
  updateQueuedProject,
} from "./lib/offlineProjects";

// Re-export types so the rest of the frontend can import from api.ts
export type {
  Project,
  ProjectWithFields,
  EntryField,
  EntryFieldValue,
  Entry,
  TimeSummary,
  ProjectStatus,
  EntryFieldType,
  RecurrencePattern,
  ChecklistItem,
  Tag,
  ArchivedFilter,
  EntryAtDate,
  EntryHistory,
  EntrySnapshot,
  EntryVersion,
  Reminder,
  ReminderSettings,
  ReminderStatusFilter,
  CustomStatistic,
};

/**
 * A project that is still only on this device — created offline and not yet
 * synced. Once it syncs it leaves the queue, and its temporary id resolves
 * to the server's through resolveSyncedId instead.
 */
function isQueuedProject(id: string): boolean {
  return isOfflineId(id) && getPendingProject(id) !== null;
}

export interface LogbookBackupProject {
  name: string;
  description: string | null;
  status: ProjectStatus;
  fields: Array<Pick<EntryField, "id" | "name" | "type" | "required" | "formula">>;
  entries: Array<Pick<Entry, "durationMinutes" | "entryDate" | "dueDate" | "values">>;
}

export interface LogbookBackup {
  format: "digital-logbook-backup";
  version: 1;
  exportedAt: string;
  projects: LogbookBackupProject[];
}

// ── Projects ─────────────────────────────────────────────────────────────

// Reads go through cachedRequest, so the last copy fetched online is still
// shown offline. Projects created offline are merged in until they sync.

export async function fetchProjects(): Promise<Project[]> {
  const projects = await cachedRequest<Project[]>("projects", async () => (await api.get("/projects")).data);
  return [...projects, ...getPendingProjects()];
}

export async function fetchProject(id: string): Promise<ProjectWithFields> {
  const pending = isQueuedProject(id) ? getPendingProject(id) : null;
  if (pending) return pending;
  const projectId = resolveSyncedId(id);
  return cachedRequest(`project:${projectId}`, async () => (await api.get(`/projects/${projectId}`)).data);
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  if (!navigator.onLine) return queueProject(data);
  try {
    const res = await api.post("/projects", data);
    return res.data;
  } catch (error) {
    if (isOfflineRequest(error)) return queueProject(data);
    throw error;
  }
}

export async function updateProject(id: string, updates: UpdateProjectInput): Promise<Project> {
  if (isQueuedProject(id)) return updateQueuedProject(id, updates);
  const res = await api.put(`/projects/${resolveSyncedId(id)}`, updates);
  return res.data;
}

export async function toggleProjectStatus(
  id: string,
  status: ProjectStatus
): Promise<Project> {
  if (isQueuedProject(id)) return updateQueuedProject(id, { status });
  const res = await api.patch(`/projects/${resolveSyncedId(id)}/status`, { status });
  return res.data;
}

/**
 * Permanently delete a project with all its fields, entries and history.
 * Unlike archiving, this can't be undone. Resolves to how many entries went with it.
 */
export async function deleteProject(id: string): Promise<number> {
  if (isQueuedProject(id)) {
    const queuedEntries = getPendingEntries(id).length;
    removeQueuedProject(id);
    return queuedEntries;
  }
  const projectId = resolveSyncedId(id);
  const res = await api.delete(`/projects/${projectId}`);
  // Entries queued offline for it would otherwise fail to sync forever.
  removePendingEntriesForProject(projectId);
  return res.data?.deletedEntries ?? 0;
}

export async function fetchProjectTimeSummary(id: string): Promise<TimeSummary> {
  if (isQueuedProject(id)) {
    // Nothing is on the server yet, so the summary is worked out from the
    // entries queued on this device.
    const entries = getPendingEntries(id);
    const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
    return {
      projectId: id,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      entryCount: entries.length,
      lastEntryAt: entries.map((e) => e.createdAt).sort().pop() ?? null,
    };
  }
  const projectId = resolveSyncedId(id);
  return cachedRequest(`summary:${projectId}`, async () => (await api.get(`/projects/${projectId}/time-summary`)).data);
}

// ── Entry Fields ─────────────────────────────────────────────────────────

export async function createEntryField(
  projectId: string,
  data: CreateEntryFieldInput
): Promise<EntryField> {
  if (isQueuedProject(projectId)) return queueField(projectId, data);
  const res = await api.post(`/projects/${resolveSyncedId(projectId)}/entry-fields`, data);
  return res.data;
}

export async function fetchEntryFields(projectId: string): Promise<EntryField[]> {
  const pending = isQueuedProject(projectId) ? getPendingFields(projectId) : null;
  if (pending) return pending;
  const id = resolveSyncedId(projectId);
  return cachedRequest(`fields:${id}`, async () => (await api.get(`/projects/${id}/entry-fields`)).data);
}

export async function updateEntryField(id: string, data: UpdateEntryFieldInput): Promise<EntryField> {
  if (isOfflineId(resolveSyncedId(id))) return updateQueuedField(id, data);
  const res = await api.put(`/entry-fields/${resolveSyncedId(id)}`, data);
  return res.data;
}

export async function deleteEntryField(id: string): Promise<void> {
  if (isOfflineId(resolveSyncedId(id))) return removeQueuedField(id);
  await api.delete(`/entry-fields/${resolveSyncedId(id)}`);
}

export async function fetchEntryFormatVersions(projectId: string) {
  if (isQueuedProject(projectId)) return [];
  const id = resolveSyncedId(projectId);
  return cachedRequest(`formats:${id}`, async () => (await api.get(`/projects/${id}/entry-format-versions`)).data);
}

// ── Tags ─────────────────────────────────────────────────────────────────

/** The caller's own tag vocabulary, for suggestions when tagging a project or entry. */
export async function fetchTags(): Promise<Tag[]> {
  return cachedRequest("tags", async () => (await api.get("/tags")).data);
}

/** Remove a tag from the vocabulary entirely, detaching it everywhere it was used. */
export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}

// ── Entries ──────────────────────────────────────────────────────────────

export async function fetchEntries(
  projectId: string,
  options: { archived?: ArchivedFilter } = {}
): Promise<Entry[]> {
  // Queued entries are never archived, so they belong in every view but "only archived".
  const pending = () => (options.archived === "only" ? [] : getPendingEntries(projectId));
  if (isQueuedProject(projectId)) return pending();
  const id = resolveSyncedId(projectId);
  const archived = options.archived ?? "exclude";
  try {
    const entries = await cachedRequest<Entry[]>(`entries:${id}:${archived}`, async () => {
      const url = `/projects/${id}/entries`;
      return (await (archived === "exclude" ? api.get(url) : api.get(url, { params: { archived } }))).data;
    });
    return [...entries, ...pending()];
  } catch (error) {
    if (isOfflineRequest(error)) return pending();
    throw error;
  }
}

/** Query params for the user-scoped listing. */
export interface EntriesQuery {
  projectId?: string;
  projectStatus?: "ACTIVE" | "ARCHIVED" | "ALL";
  from?: string;
  to?: string;
  limit?: number;
  /** Leave archived entries out (default), show only them, or include them. */
  archived?: ArchivedFilter;
}

export interface EntriesListing {
  entries: Entry[];
  /** True when exactly `limit` rows came back, so there may be more. */
  truncated: boolean;
  /** Current fields per project, taken from the newest snapshot seen. */
  fieldsByProject: Record<string, EntryField[]>;
  /**
   * Projects with at least one entry carrying no format snapshot — legacy
   * entries predating format versioning, and entries still queued offline.
   * Those need the project's live field list as a fallback, so the caller
   * fetches fields for these projects only rather than for all of them.
   */
  projectsNeedingFields: string[];
}

/**
 * One request for entries across every project, replacing one request per
 * project. The wire format returns format snapshots once in a shared map;
 * they are reattached to each entry here so callers keep working with plain
 * Entry objects.
 */
export async function fetchAllEntries(
  query: EntriesQuery = {},
  options: { pendingProjectIds?: string[] } = {}
): Promise<EntriesListing> {
  // fetchEntries appended the pending entries for the one project it was
  // asked about. A listing across projects has no such implicit scope, so
  // the caller says which projects it is showing; without it, every queued
  // entry is included.
  const pendingFor = (): Entry[] => {
    if (query.archived === "only") return [];
    const all = getPendingEntries(query.projectId);
    if (!options.pendingProjectIds) return all;
    const allowed = new Set(options.pendingProjectIds);
    return all.filter((e) => allowed.has(e.projectId));
  };

  const offlineFallback = (): EntriesListing => {
    const pending = pendingFor();
    return {
      entries: pending,
      truncated: false,
      fieldsByProject: {},
      projectsNeedingFields: [...new Set(pending.map((e) => e.projectId))],
    };
  };

  try {
    const data = await cachedRequest(`entries-all:${JSON.stringify(query)}`, async () =>
      (await api.get("/entries", { params: query })).data
    );
    const raw = (data?.entries ?? []) as (Omit<Entry, "format"> & { formatVersionId: string | null })[];
    const formats = (data?.formats ?? {}) as Record<string, { version: number; fields: EntryField[] }>;

    const fieldsByProject: Record<string, EntryField[]> = {};
    const newestSeen: Record<string, number> = {};
    const needFields = new Set<string>();

    const entries: Entry[] = raw.map((item) => {
      const { formatVersionId, ...rest } = item;
      const snapshot = formatVersionId ? formats[formatVersionId] : undefined;

      if (snapshot) {
        if ((newestSeen[item.projectId] ?? -1) < snapshot.version) {
          newestSeen[item.projectId] = snapshot.version;
          fieldsByProject[item.projectId] = snapshot.fields;
        }
      } else {
        needFields.add(item.projectId);
      }

      return { ...rest, format: snapshot ? { version: snapshot.version, fields: snapshot.fields } : null } as Entry;
    });

    // Entries captured offline have not reached the server, so they are
    // appended here exactly as fetchEntries does for a single project.
    const pending = pendingFor();
    pending.forEach((e) => needFields.add(e.projectId));

    return {
      entries: [...entries, ...pending],
      truncated: Boolean(data?.truncated),
      fieldsByProject,
      projectsNeedingFields: [...needFields],
    };
  } catch (error) {
    if (isOfflineRequest(error)) return offlineFallback();
    throw error;
  }
}

export async function createEntry(
  projectId: string,
  data: CreateEntryInput
): Promise<Entry> {
  // A project still only on this device can't take entries on the server
  // yet; the entry is queued and follows the project when it syncs.
  if (isQueuedProject(projectId)) return queueEntry(projectId, data);

  // A page opened on an offline project that has synced since still holds
  // the temporary ids; send the server's.
  const id = resolveSyncedId(projectId);
  const payload = id === projectId ? data : {
    ...data,
    values: Object.fromEntries(Object.entries(data.values).map(([fieldId, value]) => [resolveSyncedId(fieldId), value])),
  };

  if (!navigator.onLine) return queueEntry(id, payload);
  try {
    const res = await api.post(`/projects/${id}/entries`, payload);
    return res.data;
  } catch (error) {
    if (isOfflineRequest(error)) return queueEntry(id, payload);
    throw error;
  }
}

export async function updateEntry(
  id: string,
  updates: UpdateEntryInput
): Promise<Entry> {
  const res = await api.put(`/entries/${id}`, updates);
  return res.data;
}

/** Enable or disable all future occurrences for one recurring entry series. */
export async function setRecurrenceEnabled(id: string, enabled: boolean): Promise<Entry["recurrence"]> {
  const res = await api.patch(`/recurrences/${id}`, { enabled });
  return res.data;
}

export async function deleteEntry(id: string): Promise<void> {
  await api.delete(`/entries/${id}`);
}

// ── Version history (US20-22) ────────────────────────────────────────────

/** Every saved version of an entry, oldest first. */
export async function fetchEntryHistory(id: string): Promise<EntryHistory> {
  const res = await api.get(`/entries/${id}/versions`);
  return res.data;
}

/** The entry as it stood at `date`, or word that it didn't exist yet. */
export async function fetchEntryAtDate(id: string, date: Date): Promise<EntryAtDate> {
  const res = await api.get(`/entries/${id}/versions/at`, { params: { date: date.toISOString() } });
  return res.data;
}

/**
 * Make an earlier version the entry's current content. The restore is saved
 * as a new version, so nothing in the history is lost.
 */
export async function restoreEntryVersion(
  id: string,
  version: number
): Promise<{ entry: Entry; version: EntryVersion; skippedFields: number }> {
  const res = await api.post(`/entries/${id}/versions/${version}/restore`);
  return res.data;
}

// ── Archiving (US30) ─────────────────────────────────────────────────────

export async function setEntryArchived(id: string, archived: boolean): Promise<Entry> {
  const res = await api.patch(`/entries/${id}/archive`, { archived });
  return res.data;
}

/** Archive (or bring back) several entries at once; resolves to how many changed. */
export async function setEntriesArchived(ids: string[], archived: boolean): Promise<number> {
  const res = await api.post("/entries/archive", { ids, archived });
  return res.data.updated;
}

// ── Reminders (US28) ─────────────────────────────────────────────────────

/** Fired after reminders change, so the sidebar badge can refresh. */
export const REMINDERS_CHANGED_EVENT = "logbook:reminders-changed";

function remindersChanged() {
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

/** The caller's reminders; the server applies their reminder rules first. */
export async function fetchReminders(status: ReminderStatusFilter = "pending"): Promise<Reminder[]> {
  return (await api.get("/reminders", { params: { status } })).data;
}

/** Pending reminders whose time has been reached. */
export async function fetchDueReminders(): Promise<Reminder[]> {
  return (await api.get("/reminders", { params: { status: "pending", due: "true" } })).data;
}

/** How many pending reminders have reached their time. */
export async function fetchDueReminderCount(): Promise<number> {
  return (await api.get("/reminders/count")).data.due;
}

export async function createReminder(data: CreateReminderInput): Promise<Reminder> {
  const res = await api.post("/reminders", data);
  remindersChanged();
  return res.data;
}

export async function updateReminder(id: string, data: UpdateReminderInput): Promise<Reminder> {
  const res = await api.patch(`/reminders/${id}`, data);
  remindersChanged();
  return res.data;
}

export async function deleteReminder(id: string): Promise<void> {
  await api.delete(`/reminders/${id}`);
  remindersChanged();
}

export async function fetchReminderSettings(): Promise<ReminderSettings> {
  return (await api.get("/reminders/settings")).data;
}

export async function updateReminderSettings(data: Partial<ReminderSettings>): Promise<ReminderSettings> {
  const res = await api.put("/reminders/settings", data);
  remindersChanged();
  return res.data;
}

/** The key browsers subscribe to push with; null when the server has push off. */
export async function fetchPushPublicKey(): Promise<string | null> {
  return (await api.get("/push/public-key")).data.publicKey;
}

/** Register this device's push subscription with the server. */
export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post("/push/subscriptions", subscription);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await api.delete("/push/subscriptions", { data: { endpoint } });
}

// ── Dashboard (US18/US19) ────────────────────────────────────────────────

/** The saved panel order; null until the student saves a layout. */
export async function fetchDashboardLayout(): Promise<string[] | null> {
  return (await api.get("/dashboard/layout")).data.panels;
}

export async function saveDashboardLayout(panels: string[]): Promise<void> {
  await api.put("/dashboard/layout", { panels });
}

export async function resetDashboardLayout(): Promise<void> {
  await api.delete("/dashboard/layout");
}

/** A project's saved statistics (US17), read so they can be shown as dashboard panels. */
export async function fetchProjectStatistics(projectId: string): Promise<CustomStatistic[]> {
  return (await api.get(`/projects/${projectId}/custom-statistics`)).data;
}

/** One saved statistic with its current value. */
export async function fetchProjectStatistic(projectId: string, statisticId: string): Promise<CustomStatistic> {
  return (await api.get(`/projects/${projectId}/custom-statistics/${statisticId}`)).data;
}

// ── Backup and restore ───────────────────────────────────────────────────

export async function exportLogbook(): Promise<LogbookBackup> {
  const projects = await fetchProjects();
  const backupProjects = await Promise.all(projects.map(async (project) => {
    const [fields, entries] = await Promise.all([
      fetchEntryFields(project.id),
      fetchEntries(project.id),
    ]);
    return {
      name: project.name,
      description: project.description,
      status: project.status,
      fields: fields.map(({ id, name, type, required, formula }) => ({ id, name, type, required, formula })),
      entries: entries.map(({ durationMinutes, entryDate, dueDate, values }) => ({
        durationMinutes, entryDate, dueDate, values,
      })),
    };
  }));

  return {
    format: "digital-logbook-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: backupProjects,
  };
}

// Every field type the app can create, not just the four oldest ones — a
// backup that leaves out TAGS/CHECKLIST/LINK/REFERENCE/COMPUTED would be
// rejected wholesale on import just for having used a newer field type.
const BACKUP_FIELD_TYPES: EntryFieldType[] = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "TAGS", "CHECKLIST", "LINK", "REFERENCE", "COMPUTED"];

function isBackup(value: unknown): value is LogbookBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LogbookBackup>;
  return candidate.format === "digital-logbook-backup"
    && candidate.version === 1
    && Array.isArray(candidate.projects)
    && candidate.projects.every((project) => project
      && typeof project.name === "string"
      && (project.description === null || typeof project.description === "string")
      && (project.status === "ACTIVE" || project.status === "ARCHIVED")
      && Array.isArray(project.fields)
      && project.fields.every((field) => field
        && typeof field.id === "string"
        && typeof field.name === "string"
        && BACKUP_FIELD_TYPES.includes(field.type)
        && typeof field.required === "boolean"
        // Older backups predate this field entirely, so a missing key reads
        // as "no formula" rather than failing validation.
        && (field.formula === null || field.formula === undefined || typeof field.formula === "string")
        && (field.type !== "COMPUTED" || Boolean(field.formula)))
      && Array.isArray(project.entries)
      && project.entries.every((entry) => entry
        && Number.isInteger(entry.durationMinutes)
        && entry.durationMinutes >= 0
        && (entry.entryDate === null || typeof entry.entryDate === "string")
        && (entry.dueDate === null || typeof entry.dueDate === "string")
        && Boolean(entry.values)
        && typeof entry.values === "object"
        && !Array.isArray(entry.values)));
}

export async function importLogbook(value: unknown): Promise<{ projects: number; entries: number }> {
  if (!isBackup(value)) {
    throw new Error("This is not a valid Digital Logbook backup file.");
  }
  if (!navigator.onLine) {
    throw new Error("Connect to the internet before importing a backup.");
  }

  let importedProjects = 0;
  let importedEntries = 0;
  for (const project of value.projects) {
    const createdProject = await createProject({
      name: project.name,
      description: project.description ?? undefined,
      status: project.status,
    });
    importedProjects++;
    const fieldIds = new Map<string, string>();
    for (const field of orderForSaving(project.fields)) {
      // A COMPUTED field's formula embeds the ids of the fields it reads
      // (e.g. "{old-id} * 2"), which no longer exist once the fields it
      // depends on are recreated under new ids. orderForSaving puts every
      // field a formula reads ahead of it — a computed field may read one
      // defined after it — so fieldIds already holds the mapping by this point.
      const formula = field.type === "COMPUTED" && field.formula
        ? field.formula.replace(/\{([^}]+)\}/g, (match, oldId) => {
            const newId = fieldIds.get(oldId.trim());
            return newId ? `{${newId}}` : match;
          })
        : undefined;
      const createdField = await createEntryField(createdProject.id, {
        name: field.name,
        type: field.type,
        required: field.required,
        formula,
      });
      fieldIds.set(field.id, createdField.id);
    }
    for (const entry of project.entries) {
      if (!Number.isInteger(entry.durationMinutes) || entry.durationMinutes < 0 || !entry.values) {
        throw new Error(`Backup contains an invalid entry in "${project.name}".`);
      }
      const values: Record<string, EntryFieldValue> = {};
      for (const [oldFieldId, entryValue] of Object.entries(entry.values)) {
        const newFieldId = fieldIds.get(oldFieldId);
        if (newFieldId) values[newFieldId] = entryValue;
      }
      await createEntry(createdProject.id, {
        durationMinutes: entry.durationMinutes,
        values,
        ...(entry.entryDate && { entryDate: entry.entryDate }),
        ...(entry.dueDate && { dueDate: entry.dueDate }),
      });
      importedEntries++;
    }
  }
  return { projects: importedProjects, entries: importedEntries };
}

// ── Automation rules (US26) ──────────────────────────────────────────────

export type AutomationTrigger = "ENTRY_CREATED" | "ENTRY_UPDATED";

export type AutomationOperator =
  | "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE"
  | "IS_EMPTY" | "IS_NOT_EMPTY" | "IS_TRUE" | "IS_FALSE";

export type AutomationCondition =
  | { source: "ATTRIBUTE"; attribute: "durationMinutes" | "status"; operator: AutomationOperator; value?: number | string }
  | { source: "FIELD"; fieldId: string; operator: AutomationOperator; value?: number | string };

export type AutomationAction =
  | { type: "ADD_TAG"; tagId: string }
  | { type: "REMOVE_TAG"; tagId: string }
  | { type: "SET_STATUS"; status: "OPEN" | "DONE" };

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  action: AutomationAction;
  enabled: boolean;
  /** Why the rule cannot currently run — its field archived, its tag deleted. */
  invalidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRuleInput {
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  action: AutomationAction;
  enabled?: boolean;
}

export async function fetchAutomationRules(projectId: string): Promise<AutomationRule[]> {
  return (await api.get(`/projects/${projectId}/automation-rules`)).data;
}

export async function createAutomationRule(
  projectId: string,
  input: AutomationRuleInput
): Promise<AutomationRule> {
  return (await api.post(`/projects/${projectId}/automation-rules`, input)).data;
}

export async function updateAutomationRule(
  projectId: string,
  id: string,
  input: Partial<AutomationRuleInput>
): Promise<AutomationRule> {
  return (await api.patch(`/projects/${projectId}/automation-rules/${id}`, input)).data;
}

export async function deleteAutomationRule(projectId: string, id: string): Promise<void> {
  await api.delete(`/projects/${projectId}/automation-rules/${id}`);
}
