/** The panels a student can add to their personal dashboard. */
/**
 * The client asked for the dashboard's statistics to go: the application has a
 * dedicated Statistics page in the side navigation, and repeating the same
 * aggregates on the dashboard duplicated it (client meeting, 2026-09-18).
 * "active-projects", "entries-this-week" and "total-time-logged" were removed
 * here rather than merely hidden, so they cannot come back through a saved
 * layout — loadDashboardPanels already discards ids it does not recognise, so a
 * student who had arranged them simply keeps the rest of their arrangement.
 */
export const DASHBOARD_PANELS = [
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
