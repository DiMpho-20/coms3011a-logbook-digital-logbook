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

function isDashboardPanelId(value: unknown): value is DashboardPanelId {
  return typeof value === "string" && DASHBOARD_PANELS.includes(value as DashboardPanelId);
}

/** Returns the full dashboard for a first visit and ignores malformed storage. */
export function loadDashboardPanels(): DashboardPanelId[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_DASHBOARD_PANELS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_DASHBOARD_PANELS];
    // Keep the saved sequence: it is the student's layout. De-duplicate and
    // discard stale/unknown panel ids so a past version cannot break the page.
    return parsed.filter(isDashboardPanelId).filter((panel, index, panels) => panels.indexOf(panel) === index);
  } catch {
    return [...DEFAULT_DASHBOARD_PANELS];
  }
}

/** Persist only known panels, keeping the arrangement selected by the student. */
export function saveDashboardPanels(panels: DashboardPanelId[]): void {
  localStorage.setItem(
    DASHBOARD_PANELS_STORAGE_KEY,
    JSON.stringify(panels.filter(isDashboardPanelId).filter((panel, index, items) => items.indexOf(panel) === index))
  );
}
