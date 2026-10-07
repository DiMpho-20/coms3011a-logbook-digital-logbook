export type Theme = "light" | "dark" | "system";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose";
export type Density = "comfortable" | "compact";

const DARK_QUERY = "(prefers-color-scheme: dark)";

let current: Theme = "light";
let listening = false;

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function paint() {
  const dark = current === "dark" || (current === "system" && systemPrefersDark());
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}

/** "System" follows the operating system, and keeps following it if it changes while the app is open. */
export function applyTheme(theme: Theme) {
  current = theme;
  if (!listening && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const query = window.matchMedia(DARK_QUERY);
    // Older Safari only has addListener.
    if (typeof query.addEventListener === "function") query.addEventListener("change", paint);
    else query.addListener?.(paint);
    listening = true;
  }
  paint();
}

export function applyAccent(color: AccentColor) {
  document.documentElement.setAttribute("data-accent", color);
}

// Comfortable is the stylesheet's own spacing, so it clears the attribute
// rather than writing a second set of rules that say what the defaults
// already say.
export function applyDensity(density: Density) {
  const root = document.documentElement;
  if (density === "comfortable") root.removeAttribute("data-density");
  else root.setAttribute("data-density", density);
}

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

// One-time reset so the light default actually reaches browsers holding a
// theme saved by older builds: the old Settings page persisted its loaded
// value merely on being opened, so "dark"/"system" got stored for people
// who never picked anything and out-ranked the light default forever. The
// flag marks the wipe done; anything saved after it is a real choice.
const THEME_MIGRATED_KEY = "logbook-theme-migrated";

function migrateLegacyTheme() {
  try {
    if (localStorage.getItem(THEME_MIGRATED_KEY)) return;
    localStorage.removeItem("logbook-theme");
    localStorage.setItem(THEME_MIGRATED_KEY, JSON.stringify(true));
  } catch {
    // Storage unavailable — fall through and use the default.
  }
}

/** Puts back the saved theme, accent and density before the first render, on every page. */
export function restoreAppearance() {
  migrateLegacyTheme();
  applyTheme(stored<Theme>("logbook-theme", ["light", "dark", "system"], "light"));
  applyAccent(stored<AccentColor>("logbook-accent", ["blue", "emerald", "violet", "amber", "rose"], "blue"));
  applyDensity(stored<Density>("logbook-density", ["comfortable", "compact"], "comfortable"));
}
