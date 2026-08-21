import type {
  Project,
  ProjectWithFields,
  EntryField,
  EntryFieldValue,
  Entry,
  TimeSummary,
  CreateProjectInput,
  UpdateProjectInput,
  CreateEntryInput,
  UpdateEntryInput,
  CreateEntryFieldInput,
  EntryFieldType,
} from "@logbook/shared";

const API_BASE_URL = "http://localhost:3000/api";

// TODO: replace with real auth once available
const USER_ID = "df8cb59f-b366-4612-8f49-403cde4d3058";

const authHeaders = {
  "Content-Type": "application/json",
  "x-user-id": USER_ID,
};

// Re-export types so the rest of the frontend can import from api.ts
export type {
  Project,
  ProjectWithFields,
  EntryField,
  EntryFieldValue,
  Entry,
  TimeSummary,
  EntryFieldType,
};

// ── Projects ─────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/projects`, { headers: authHeaders });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function fetchProject(id: string): Promise<ProjectWithFields> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeaders });
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(id: string, updates: UpdateProjectInput): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function fetchProjectTimeSummary(id: string): Promise<TimeSummary> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}/time-summary`, { headers: authHeaders });
  if (!res.ok) throw new Error("Failed to fetch time summary");
  return res.json();
}

// ── Entry Fields ─────────────────────────────────────────────────────────

export async function createEntryField(
  projectId: string,
  data: CreateEntryFieldInput
): Promise<EntryField> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/entry-fields`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to create entry field");
  }
  return res.json();
}

export async function fetchEntryFields(projectId: string): Promise<EntryField[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/entry-fields`, {
    headers: authHeaders,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to fetch entry fields");
  }
  return res.json();
}

// ── Entries ──────────────────────────────────────────────────────────────

export async function fetchEntries(projectId: string): Promise<Entry[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/entries`, {
    headers: authHeaders,
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to fetch entries");
  return res.json();
}

export async function createEntry(
  projectId: string,
  data: CreateEntryInput
): Promise<Entry> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/entries`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to create entry");
  return res.json();
}

export async function updateEntry(
  id: string,
  updates: UpdateEntryInput
): Promise<Entry> {
  const res = await fetch(`${API_BASE_URL}/entries/${id}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to update entry");
  return res.json();
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/entries/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to delete entry");
}
