import { fetchDashboardLayout, resetDashboardLayout, saveDashboardLayout } from "../api";

/**
 * The built-in panels a student can add to their personal dashboard.
 *
 * The client asked for the dashboard's statistics to go: the application has a
 * dedicated Statistics page in the side navigation, and repeating the same
 * aggregates on the dashboard duplicated it (client meeting, 2026-09-18).
 * "active-projects", "entries-this-week" and "total-time-logged" were removed
 * here rather than merely hidden, so they cannot come back through a saved
 * layout — loadDashboardPanels already discards ids it does not recognise, so a
 * student who had arranged them simply keeps the rest of their arrangement.
 */
export const DASHBOARD_PANELS = [
  "entry-streak",
  "deadline-reminders",
  "activity",
  "current-projects",
  "entry-progress",
  "monthly-entries",
  "week-comparison",
  "tags",
  "tag-ranking",
  "recent-entries",
] as const;

export type BuiltInPanelId = typeof DASHBOARD_PANELS[number];
/** A statistic the student saved on the Stats page, shown as its own panel. */
export type StatisticPanelId = `stat:${string}:${string}`;
export type DashboardPanelId = BuiltInPanelId | StatisticPanelId;

export const DASHBOARD_PANELS_STORAGE_KEY = "logbook-dashboard-panels";
export const DEFAULT_DASHBOARD_PANELS: DashboardPanelId[] = [...DASHBOARD_PANELS];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function statisticPanelId(projectId: string, statisticId: string): StatisticPanelId {
  return `stat:${projectId}:${statisticId}`;
}

/** The project and statistic a statistic panel points at, or null for a built-in panel. */
export function parseStatisticPanel(panel: string): { projectId: string; statisticId: string } | null {
  const [kind, projectId, statisticId, ...rest] = panel.split(":");
  if (kind !== "stat" || rest.length > 0 || !UUID.test(projectId ?? "") || !UUID.test(statisticId ?? "")) return null;
  return { projectId, statisticId };
}

export function isBuiltInPanel(value: unknown): value is BuiltInPanelId {
  return typeof value === "string" && DASHBOARD_PANELS.includes(value as BuiltInPanelId);
}

function isDashboardPanelId(value: unknown): value is DashboardPanelId {
  return isBuiltInPanel(value) || (typeof value === "string" && parseStatisticPanel(value) !== null);
}

/** Known panels only, each once, in the order given. */
function cleanPanels(panels: unknown[]): DashboardPanelId[] {
  // Keep the saved sequence: it is the student's layout. De-duplicate and
  // discard stale/unknown panel ids so a past version cannot break the page.
  return panels.filter(isDashboardPanelId).filter((panel, index, items) => items.indexOf(panel) === index);
}

/** Returns the full dashboard for a first visit and ignores malformed storage. */
export function loadDashboardPanels(): DashboardPanelId[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_DASHBOARD_PANELS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_DASHBOARD_PANELS];
    return cleanPanels(parsed);
  } catch {
    return [...DEFAULT_DASHBOARD_PANELS];
  }
}

/** Persist only known panels on this device, keeping the student's arrangement. */
export function saveDashboardPanels(panels: DashboardPanelId[]): void {
  try {
    localStorage.setItem(DASHBOARD_PANELS_STORAGE_KEY, JSON.stringify(cleanPanels(panels)));
  } catch {
    // Storage blocked: the server copy still holds the layout.
  }
}

/**
 * Save the layout on this device straight away, and on the server so it
 * follows the student to other browsers. Resolves to whether the server
 * accepted it; the local copy is kept either way.
 */
export async function persistDashboardPanels(panels: DashboardPanelId[]): Promise<boolean> {
  saveDashboardPanels(panels);
  try {
    await saveDashboardLayout(cleanPanels(panels));
    return true;
  } catch {
    return false;
  }
}

/** Back to the default dashboard, here and on the server. */
export async function resetDashboardPanels(): Promise<void> {
  saveDashboardPanels(DEFAULT_DASHBOARD_PANELS);
  await resetDashboardLayout().catch(() => {});
}

/**
 * The layout saved on the server, which wins over this device's copy.
 * A layout saved only on this device (from before layouts were kept on the
 * server) is uploaded instead. Resolves to null when the server can't be
 * reached or there's nothing newer than what the page already shows.
 */
export async function syncDashboardPanels(): Promise<DashboardPanelId[] | null> {
  let saved: string[] | null;
  try {
    saved = await fetchDashboardLayout();
  } catch {
    return null;
  }
  if (saved) {
    const panels = cleanPanels(saved);
    saveDashboardPanels(panels);
    return panels;
  }
  let hasLocal = false;
  try {
    hasLocal = localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY) !== null;
  } catch {
    // Treat as nothing stored.
  }
  if (hasLocal) await saveDashboardLayout(loadDashboardPanels()).catch(() => {});
  return null;
}
