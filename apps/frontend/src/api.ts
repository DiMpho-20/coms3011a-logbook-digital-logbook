const API_BASE_URL = "http://localhost:3000/api";

// TODO: replace with real auth once available
const USER_ID = "df8cb59f-b366-4612-8f49-403cde4d3058";
 
const authHeaders = {
  "Content-Type": "application/json",
  "x-user-id": USER_ID,
};

export interface Project {
  id: string ;
  userId?: string | number | null;
  name: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt?: string;
  updatedAt?: string;
}

export interface EntryField {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  required: boolean; 
}

export type EntryFieldValue = string | number | boolean | null;

export interface Entry {
  id: string;
  projectId: string;
  durationMinutes: number;
  values: Record<string, EntryFieldValue>;
  createdAt: string;
  updatedAt?: string;
}

//project 

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(project: Omit<Project, "id">): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(id: string | number, updates: Partial<Project>): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function createEntryField(
  projectId: string,
  data: {
    name: string;
    type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  }
): Promise<EntryField> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/entry-fields`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to create entry field");
  }

  return response.json();
}

export async function fetchEntryFields(projectId: string): Promise<EntryField[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/entry-fields`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to fetch entry fields");
  }

  return response.json();
}

export async function fetchEntries(projectId: string): Promise<Entry[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/entries`, {
    headers: authHeaders,
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to fetch entries");
  return res.json();
}

export async function createEntry(
  projectId: string,
  data: { durationMinutes: number; values: Record<string, EntryFieldValue> }
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
  updates: Partial<Pick<Entry, "durationMinutes" | "values">>
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