import { describe, expect, it } from "vitest";
import {
  DASHBOARD_PANELS_STORAGE_KEY,
  DEFAULT_DASHBOARD_PANELS,
  loadDashboardPanels,
  saveDashboardPanels,
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
