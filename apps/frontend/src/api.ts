const API_BASE_URL = "http://localhost:3000/api";

export interface Project {
  id: string | number;
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
