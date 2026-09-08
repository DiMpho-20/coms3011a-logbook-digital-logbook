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
} from "@logbook/shared";
import { api } from "./api/client";

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
};

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

// ── Entries ──────────────────────────────────────────────────────────────

export async function fetchEntries(projectId: string): Promise<Entry[]> {
  const res = await api.get(`/projects/${projectId}/entries`);
  return res.data;
}

export async function createEntry(
  projectId: string,
  data: CreateEntryInput
): Promise<Entry> {
  const res = await api.post(`/projects/${projectId}/entries`, data);
  return res.data;
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
