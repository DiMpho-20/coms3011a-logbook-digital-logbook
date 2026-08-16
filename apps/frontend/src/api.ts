const API_BASE_URL = "http://localhost:3000/api";

export interface Project {
  id?: string;
  code: string;
  title: string;
  description: string;
  assignedTo: string;
  status: "ACTIVE" | "ARCHIVED";
  entriesCount?: number;
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