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
