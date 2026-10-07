export type Theme = "light" | "dark" | "system";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose";
export type Density = "comfortable" | "compact";

const DARK_QUERY = "(prefers-color-scheme: dark)";

let current: Theme = "system";
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

/** Puts back the saved theme, accent and density before the first render, on every page. */
export function restoreAppearance() {
  applyTheme(stored<Theme>("logbook-theme", ["light", "dark", "system"], "system"));
  applyAccent(stored<AccentColor>("logbook-accent", ["blue", "emerald", "violet", "amber", "rose"], "blue"));
  applyDensity(stored<Density>("logbook-density", ["comfortable", "compact"], "comfortable"));
}
