const API_BASE_URL = "http://localhost:3000/api";

export interface Project {
  id: string ;
  userId?: string | number | null;
  name: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt?: string;
  updatedAt?: string;
}

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
) {
  const response = await fetch(
    `http://localhost:3000/api/projects/${projectId}/entry-fields`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "df8cb59f-b366-4612-8f49-403cde4d3058",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to create entry field");
  }

  return response.json();
}
export async function fetchEntryFields(projectId: string) {
  const response = await fetch(
    `http://localhost:3000/api/projects/${projectId}/entry-fields`,
    {
      headers: {
        "x-user-id": "df8cb59f-b366-4612-8f49-403cde4d3058",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to fetch entry fields");
  }

  return response.json();
}
