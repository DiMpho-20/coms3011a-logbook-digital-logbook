// ─── Enums & Constants ───────────────────────────────────────────────────

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type EntryFieldType =
  | "TEXT"
  | "NUMBER"
  | "DATE"
  | "BOOLEAN"
  | "TAGS"
  | "CHECKLIST"
  | "LINK"
  | "REFERENCE"
  | "COMPUTED";

// ─── Response Types ──────────────────────────────────────────────────────

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithFields extends Project {
  entryFields: EntryField[];
}

export interface EntryField {
  id: string;
  projectId: string;
  name: string;
  type: EntryFieldType;
  required: boolean;
  formula: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  label: string;
  checked: boolean;
}

export interface EntryReference {
  id: string;
  label?: string;
  kind?: "project" | "entry";
}

export type EntryFieldValue = string | number | boolean | string[] | ChecklistItem[] | EntryReference | null;

export interface EntryFormatSnapshot {
  version: number;
  fields: EntryField[];
}

export interface Entry {
  id: string;
  projectId: string;
  durationMinutes: number;
  entryDate: string | null;
  dueDate: string | null;
  values: Record<string, EntryFieldValue>;
  format: EntryFormatSnapshot | null;
  createdAt: string;
  updatedAt: string;
  status: "OPEN" | "DONE";
  completedAt: string | null;
}

export interface TimeSummary {
  projectId: string;
  totalMinutes: number;
  totalHours: number;
  entryCount: number;
  lastEntryAt: string | null;
}

// ─── Request / Input Types ───────────────────────────────────────────────

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface CreateEntryInput {
  durationMinutes: number;
  values: Record<string, EntryFieldValue>;
  entryDate?: string;
  dueDate?: string;
}

export interface UpdateEntryInput {
  durationMinutes?: number;
  values?: Record<string, EntryFieldValue>;
  entryDate?: string | null;
  dueDate?: string | null;
}

export interface CreateEntryFieldInput {
  name: string;
  type: EntryFieldType;
  required?: boolean;
  formula?: string;
}

export interface UpdateEntryFieldInput {
  name?: string;
  required?: boolean;
  formula?: string | null;
}

// ─── Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────

export * from "./auth.js";
