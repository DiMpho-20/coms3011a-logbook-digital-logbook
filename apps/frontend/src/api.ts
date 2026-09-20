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
  Tag,
} from "@logbook/shared";
import { api } from "./api/client";
import { getPendingEntries, isOfflineRequest, queueEntry } from "./lib/offlineEntries";

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
  Tag,
};

export interface LogbookBackupProject {
  name: string;
  description: string | null;
  status: ProjectStatus;
  fields: Array<Pick<EntryField, "id" | "name" | "type" | "required">>;
  entries: Array<Pick<Entry, "durationMinutes" | "entryDate" | "dueDate" | "values">>;
}

export interface LogbookBackup {
  format: "digital-logbook-backup";
  version: 1;
  exportedAt: string;
  projects: LogbookBackupProject[];
}

// ── Projects ─────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const res = await api.get("/projects");
  return res.data;
}

export async function fetchProject(id: string): Promise<ProjectWithFields> {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  const res = await api.post("/projects", data);
  return res.data;
}

export async function updateProject(id: string, updates: UpdateProjectInput): Promise<Project> {
  const res = await api.put(`/projects/${id}`, updates);
  return res.data;
}

export async function toggleProjectStatus(
  id: string,
  status: ProjectStatus
): Promise<Project> {
  const res = await api.patch(`/projects/${id}/status`, { status });
  return res.data;
}

export async function fetchProjectTimeSummary(id: string): Promise<TimeSummary> {
  const res = await api.get(`/projects/${id}/time-summary`);
  return res.data;
}

// ── Entry Fields ─────────────────────────────────────────────────────────

export async function createEntryField(
  projectId: string,
  data: CreateEntryFieldInput
): Promise<EntryField> {
  const res = await api.post(`/projects/${projectId}/entry-fields`, data);
  return res.data;
}

export async function fetchEntryFields(projectId: string): Promise<EntryField[]> {
  const res = await api.get(`/projects/${projectId}/entry-fields`);
  return res.data;
}

export async function updateEntryField(id: string, data: UpdateEntryFieldInput): Promise<EntryField> {
  const res = await api.put(`/entry-fields/${id}`, data);
  return res.data;
}

export async function deleteEntryField(id: string): Promise<void> {
  await api.delete(`/entry-fields/${id}`);
}

export async function fetchEntryFormatVersions(projectId: string) {
  const res = await api.get(`/projects/${projectId}/entry-format-versions`);
  return res.data;
}

// ── Tags ─────────────────────────────────────────────────────────────────

/** The caller's own tag vocabulary, for suggestions when tagging a project or entry. */
export async function fetchTags(): Promise<Tag[]> {
  const res = await api.get("/tags");
  return res.data;
}

/** Remove a tag from the vocabulary entirely, detaching it everywhere it was used. */
export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}

// ── Entries ──────────────────────────────────────────────────────────────

export async function fetchEntries(projectId: string): Promise<Entry[]> {
  try {
    const res = await api.get(`/projects/${projectId}/entries`);
    return [...res.data, ...getPendingEntries(projectId)];
  } catch (error) {
    if (isOfflineRequest(error)) return getPendingEntries(projectId);
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
    const res = await api.get("/entries", { params: query });
    const raw = (res.data?.entries ?? []) as (Omit<Entry, "format"> & { formatVersionId: string | null })[];
    const formats = (res.data?.formats ?? {}) as Record<string, { version: number; fields: EntryField[] }>;

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
      truncated: Boolean(res.data?.truncated),
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
  if (!navigator.onLine) return queueEntry(projectId, data);
  try {
    const res = await api.post(`/projects/${projectId}/entries`, data);
    return res.data;
  } catch (error) {
    if (isOfflineRequest(error)) return queueEntry(projectId, data);
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

export async function deleteEntry(id: string): Promise<void> {
  await api.delete(`/entries/${id}`);
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
      fields: fields.map(({ id, name, type, required }) => ({ id, name, type, required })),
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
        && ["TEXT", "NUMBER", "DATE", "BOOLEAN"].includes(field.type)
        && typeof field.required === "boolean")
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
    for (const field of project.fields) {
      const createdField = await createEntryField(createdProject.id, {
        name: field.name,
        type: field.type,
        required: field.required,
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
