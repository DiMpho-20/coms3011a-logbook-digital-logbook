// Keyboard quick capture (issue #92): press N anywhere in the app to start a
// new entry, and Ctrl/Cmd+Enter to save it, so a student can log work without
// reaching for the mouse.

const LAST_PROJECT_KEY = "logbook-last-project";

/** Remember the project a student last worked in, so N returns them to it. */
export function rememberProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Storage blocked: N falls back to the first active project.
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Forget a remembered project that no longer loads (deleted, or not ours). */
export function forgetProject(id: string): void {
  try {
    if (localStorage.getItem(LAST_PROJECT_KEY) === id) localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // Nothing to undo.
  }
}

/** True while the student is typing, where N is just the letter N. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Whether a keypress is the quick-capture shortcut. Plain N only: not while
 * typing, not with a modifier (Ctrl/Cmd+N belong to the browser), not when
 * held down, and not while a dialog is already open.
 */
export function isQuickCaptureKey(e: KeyboardEvent): boolean {
  if (e.key !== "n" && e.key !== "N") return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  if (isTypingTarget(e.target)) return false;
  return document.querySelector('[role="dialog"]') === null;
}

/** Ctrl+Enter, or Cmd+Enter on a Mac: save the form being filled in. */
export function isSaveShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

// ── Prefilling a new entry from the last one ─────────────────────────────

const LAST_ENTRY_KEY = (projectId: string) => `logbook-last-entry:${projectId}`;

type FieldLike = { id: string; type: string };

/** What a new entry in this project starts with, carried from the last one saved. */
export interface EntryDefaults {
  duration: string;
  values: Record<string, unknown>;
  tags: string[];
}

/**
 * Which of the last entry's values are predictable enough to carry over.
 * Not the description (the project's first TEXT field: it is what this
 * entry is about), a link (it points at one particular thing), a date
 * (today is the default) or a computed field (it fills itself in). A
 * checklist keeps its items but starts with none ticked.
 */
function carriedValue(field: FieldLike, value: unknown, descriptionId: string | undefined): unknown {
  if (field.id === descriptionId) return undefined;
  switch (field.type) {
    case "LINK":
    case "DATE":
    case "COMPUTED":
      return undefined;
    case "CHECKLIST":
      return Array.isArray(value)
        ? value.filter((item) => item && typeof item === "object" && "label" in item)
            .map((item) => ({ label: (item as { label: string }).label, checked: false }))
        : undefined;
    default:
      return value;
  }
}

/** Remember a saved entry so the next one in the project can start from it. */
export function rememberEntryDefaults(
  projectId: string,
  fields: FieldLike[],
  entry: { durationMinutes: number; values: Record<string, unknown>; tags?: string[] }
): void {
  const descriptionId = fields.find((f) => f.type === "TEXT")?.id;
  // Each value is kept with its field's type, so it is not offered to a
  // field that has since changed type.
  const values: Record<string, { type: string; value: unknown }> = {};
  for (const field of fields) {
    const carried = carriedValue(field, entry.values[field.id], descriptionId);
    if (carried !== undefined && carried !== null && carried !== "") values[field.id] = { type: field.type, value: carried };
  }
  try {
    localStorage.setItem(
      LAST_ENTRY_KEY(projectId),
      JSON.stringify({ duration: entry.durationMinutes > 0 ? String(entry.durationMinutes) : "", values, tags: entry.tags ?? [] })
    );
  } catch {
    // Storage blocked: new entries simply start blank.
  }
}

/**
 * The remembered starting point for a new entry, limited to fields the
 * project still has with the same type; null when nothing is remembered.
 */
export function entryDefaults(projectId: string, fields: FieldLike[]): EntryDefaults | null {
  try {
    const raw = localStorage.getItem(LAST_ENTRY_KEY(projectId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      duration?: unknown;
      values?: Record<string, { type?: string; value?: unknown }>;
      tags?: unknown;
    };
    const values: Record<string, unknown> = {};
    const descriptionId = fields.find((f) => f.type === "TEXT")?.id;
    for (const field of fields) {
      const kept = saved.values?.[field.id];
      if (!kept || kept.type !== field.type || kept.value === undefined) continue;
      // Re-check against today's format: a field may have become the description.
      const carried = carriedValue(field, kept.value, descriptionId);
      if (carried !== undefined) values[field.id] = carried;
    }
    return {
      duration: typeof saved.duration === "string" ? saved.duration : "",
      values,
      tags: Array.isArray(saved.tags) ? saved.tags.filter((t): t is string => typeof t === "string") : [],
    };
  } catch {
    return null;
  }
}
