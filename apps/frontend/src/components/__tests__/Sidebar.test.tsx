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
  it("groups every page into Today, Work, Academics and Personal", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual([
      "Dashboard", "Reminders", "Calendar",
      "Projects", "Entries", "Open Work", "Board", "Statistics",
      "My Grades",
      "Profile", "Settings",
    ]);
    for (const heading of ["Today", "Work", "Academics", "Personal"]) expect(within(nav).getByText(heading)).toBeInTheDocument();
  });

  it("marks the current page, and only that one", () => {
    render(<MemoryRouter initialEntries={["/settings"]}><Sidebar /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const current = within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Settings"]);
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(nav).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
  });

  it("keeps a nested page's section marked", () => {
    render(<MemoryRouter initialEntries={["/projects/p1"]}><Sidebar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("shows who is signed in, with a way to log out", () => {
    localStorage.setItem("logbook-name", "Dineo");
    renderSidebar();
    expect(screen.getByText("Dineo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    localStorage.removeItem("logbook-name");
  });

  it("shows the due-reminder count from the server on Reminders", async () => {
    vi.mocked(api.fetchDueReminderCount).mockResolvedValue(3);
    renderSidebar();
    expect(await screen.findByLabelText("3 reminders due")).toHaveTextContent("3");
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
