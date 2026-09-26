/** The panels a student can add to their personal dashboard. */
export const DASHBOARD_PANELS = [
  "active-projects",
  "entries-this-week",
  "total-time-logged",
  "deadline-reminders",
  "activity",
  "current-projects",
  "tags",
  "recent-entries",
] as const;

export type DashboardPanelId = typeof DASHBOARD_PANELS[number];

export const DASHBOARD_PANELS_STORAGE_KEY = "logbook-dashboard-panels";
export const DEFAULT_DASHBOARD_PANELS: DashboardPanelId[] = [...DASHBOARD_PANELS];

/** Returns the full dashboard for a first visit and ignores malformed storage. */
export function loadDashboardPanels(): DashboardPanelId[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_DASHBOARD_PANELS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_DASHBOARD_PANELS];
    return DASHBOARD_PANELS.filter((panel) => parsed.includes(panel));
  } catch {
    return [...DEFAULT_DASHBOARD_PANELS];
  }
}

/** Persist only known panels, in their stable dashboard display order. */
export function saveDashboardPanels(panels: DashboardPanelId[]): void {
  localStorage.setItem(
    DASHBOARD_PANELS_STORAGE_KEY,
    JSON.stringify(DASHBOARD_PANELS.filter((panel) => panels.includes(panel)))
  );
}
