import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchDueReminderCount: vi.fn(),
  fetchDueReminders: vi.fn(),
  REMINDERS_CHANGED_EVENT: "logbook:reminders-changed",
}));
vi.mock("../../lib/reminderNotifications", () => ({
  reminderNotificationMode: vi.fn(() => null),
  notifyNewDueReminders: vi.fn(async () => []),
  disableReminderNotifications: vi.fn(async () => {}),
}));

import * as api from "../../api";
import * as notifications from "../../lib/reminderNotifications";
import Sidebar from "../Sidebar";

const renderSidebar = () => render(<MemoryRouter initialEntries={["/dashboard"]}><Sidebar /></MemoryRouter>);

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchDueReminderCount).mockResolvedValue(0);
  vi.mocked(api.fetchDueReminders).mockResolvedValue([]);
  vi.mocked(notifications.reminderNotificationMode).mockReturnValue(null);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Sidebar navigation", () => {
  it("groups pages into Today, Work and Academics", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual([
      "Dashboard", "Reminders", "Calendar",
      "Projects", "Entries", "Open Work", "Board", "Statistics",
      "My Grades",
    ]);
    for (const heading of ["Today", "Work", "Academics"]) expect(within(nav).getByText(heading)).toBeInTheDocument();
  });

  it("keeps Profile and Settings in the account menu rather than the main list", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByText("Profile")).toBeNull();
    expect(within(nav).queryByText("Settings")).toBeNull();
    act(() => screen.getAllByText("Student")[0].closest("button")!.click());
    expect(screen.getByRole("button", { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toBeInTheDocument();
  });
});

describe("due-reminder badge", () => {
  it("doesn't check while the tab is hidden, and checks again when it comes back", async () => {
    vi.useFakeTimers();
    renderSidebar();
    expect(api.fetchDueReminderCount).toHaveBeenCalledTimes(1);

    setHidden(true);
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    expect(api.fetchDueReminderCount).toHaveBeenCalledTimes(1);

    await act(async () => { setHidden(false); });
    expect(api.fetchDueReminderCount).toHaveBeenCalledTimes(2);
  });

  it("keeps checking in a hidden tab that shows device notifications", async () => {
    vi.mocked(notifications.reminderNotificationMode).mockReturnValue("in-app");
    vi.useFakeTimers();
    renderSidebar();
    expect(api.fetchDueReminders).toHaveBeenCalledTimes(1);

    setHidden(true);
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    expect(api.fetchDueReminders).toHaveBeenCalledTimes(2);
  });
});
