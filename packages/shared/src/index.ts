// ─── Enums & Constants ───────────────────────────────────────────────────

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type RecurrencePattern = "DAILY" | "WEEKLY" | "MONTHLY";
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
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** A user's own tag, as returned by GET /tags for autocomplete/management. */
export interface Tag {
  id: string;
  name: string;
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
  tags: string[];
  createdAt: string;
  updatedAt: string;
  status: "OPEN" | "DONE";
  completedAt: string | null;
  /** When the entry was moved to the archive; null (or absent offline) while active. */
  archivedAt?: string | null;
  recurrence?: {
    id: string;
    pattern: RecurrencePattern;
    enabled: boolean;
    nextOccurrence: string;
    until: string | null;
  } | null;
}

/** An entry's content at one point in its history, without its identity or archive state. */
export type EntrySnapshot = Omit<Entry, "id" | "projectId" | "createdAt" | "updatedAt" | "archivedAt">;

export type EntryVersionReason = "CREATED" | "UPDATED" | "RESTORED";

export interface EntryVersion {
  version: number;
  reason: EntryVersionReason;
  /** Set when reason is RESTORED: the version whose content was brought back. */
  restoredFromVersion: number | null;
  /** When this version became the entry's current state. */
  createdAt: string;
  snapshot: EntrySnapshot;
}

export interface EntryHistory {
  entryId: string;
  entryCreatedAt: string;
  currentVersion: number;
  /** Oldest first. */
  versions: EntryVersion[];
}

/** GET /entries/:id/versions/at — the entry as it stood at a given moment. */
export type EntryAtDate =
  | { existed: false; entryCreatedAt: string }
  | { existed: true; entryCreatedAt: string; version: EntryVersion; isCurrent: boolean };

export type ArchivedFilter = "exclude" | "only" | "include";

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
  tags?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  tags?: string[];
}

export interface CreateEntryInput {
  durationMinutes: number;
  values: Record<string, EntryFieldValue>;
  entryDate?: string;
  dueDate?: string;
  tags?: string[];
  recurrence?: { pattern: RecurrencePattern; until?: string };
}

export interface UpdateEntryInput {
  durationMinutes?: number;
  values?: Record<string, EntryFieldValue>;
  entryDate?: string | null;
  dueDate?: string | null;
  tags?: string[];
}

export interface CreateEntryFieldInput {
  name: string;
  type: EntryFieldType;
  required?: boolean;
  formula?: string;
}

export interface UpdateEntryFieldInput {
  name?: string;
  type?: EntryFieldType;
  required?: boolean;
  formula?: string | null;
}

// ─── Error ───────────────────────────────────────────────────────────────

/** US16 — a custom expression evaluated over one project's entries. */
export interface EvaluateExpressionInput {
  expression: string;
}

export interface ExpressionResult {
  value: number;
}

export interface ApiError {
  error: string;
}

// ─── Reminders (US28) ────────────────────────────────────────────────────

export type ReminderStatus = "PENDING" | "COMPLETED" | "DISMISSED";
/** MANUAL reminders are set by the student; the rest come from their rules. */
export type ReminderSource = "MANUAL" | "DUE_SOON" | "OVERDUE" | "STALE" | "DAILY_LOG";
export type ReminderStatusFilter = "pending" | "completed" | "dismissed" | "done" | "all";

export interface Reminder {
  id: string;
  title: string;
  note: string | null;
  source: ReminderSource;
  status: ReminderStatus;
  /** When the reminder falls due; pending reminders before this are upcoming. */
  remindAt: string;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  entry: {
    id: string;
    projectId: string;
    projectName: string;
    label: string;
    dueDate: string | null;
    status: "OPEN" | "DONE";
  } | null;
}

export interface CreateReminderInput {
  title: string;
  note?: string | null;
  remindAt: string;
  entryId?: string | null;
}

export interface UpdateReminderInput {
  status?: ReminderStatus;
  title?: string;
  note?: string | null;
  remindAt?: string;
}

/** The rules reminders are generated from. */
export interface ReminderSettings {
  dueSoonEnabled: boolean;
  /** Remind this many days before an entry's due date (0 = on the day). */
  dueSoonDays: number;
  overdueEnabled: boolean;
  staleEnabled: boolean;
  /** Remind about an open entry not edited for this many days. */
  staleDays: number;
  dailyLogEnabled: boolean;
  /** "HH:MM" — remind after this time if nothing was logged that day. */
  dailyLogTime: string;
  /** IANA zone calendar days are counted in. */
  timeZone: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────

export * from "./auth.js";
