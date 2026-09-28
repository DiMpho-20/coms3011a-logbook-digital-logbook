import { describe, expect, it } from "vitest";
import {
  DASHBOARD_PANELS_STORAGE_KEY,
  DEFAULT_DASHBOARD_PANELS,
  loadDashboardPanels,
  parseStatisticPanel,
  saveDashboardPanels,
  statisticPanelId,
} from "../dashboardPreferences";

describe("dashboard panel preferences", () => {
  it("uses the complete dashboard when no preference has been saved", () => {
    expect(loadDashboardPanels()).toEqual(DEFAULT_DASHBOARD_PANELS);
  });

  it("ignores malformed saved preferences", () => {
    localStorage.setItem(DASHBOARD_PANELS_STORAGE_KEY, "not valid json");
    expect(loadDashboardPanels()).toEqual(DEFAULT_DASHBOARD_PANELS);
  });

  it("persists known panels in the student's selected order", () => {
    saveDashboardPanels(["tags", "activity", "tags"]);

    expect(localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY)).toBe(
      JSON.stringify(["tags", "activity"])
    );
    expect(loadDashboardPanels()).toEqual(["tags", "activity"]);
  });
});

describe("statistic panels", () => {
  const PROJECT = "11111111-1111-4111-8111-111111111111";
  const STAT = "22222222-2222-4222-8222-222222222222";

  it("names a saved statistic by its project and id", () => {
    const panel = statisticPanelId(PROJECT, STAT);
    expect(parseStatisticPanel(panel)).toEqual({ projectId: PROJECT, statisticId: STAT });
  });

  it("aren't confused with built-in or malformed panels", () => {
    expect(parseStatisticPanel("activity")).toBeNull();
    expect(parseStatisticPanel("stat:p1:s1")).toBeNull();
    expect(parseStatisticPanel(`stat:${PROJECT}:${STAT}:extra`)).toBeNull();
  });

  it("are kept in the saved layout alongside built-in panels", () => {
    const panel = statisticPanelId(PROJECT, STAT);
    saveDashboardPanels(["tags", panel]);
    expect(loadDashboardPanels()).toEqual(["tags", panel]);
  });
});
