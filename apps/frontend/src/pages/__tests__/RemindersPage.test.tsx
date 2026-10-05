import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchReminders: vi.fn(),
  fetchReminderSettings: vi.fn(),
  updateReminderSettings: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchAllEntries: vi.fn().mockResolvedValue({ entries: [], truncated: false, fieldsByProject: {}, projectsNeedingFields: [] }),
}));

import * as api from "../../api";
import RemindersPage from "../RemindersPage";

const HOUR = 3_600_000;

const reminder = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  title: "Email supervisor",
  note: null,
  source: "MANUAL",
  status: "PENDING",
  remindAt: new Date(Date.now() - HOUR).toISOString(),
  completedAt: null,
  dismissedAt: null,
  createdAt: new Date().toISOString(),
  entry: null,
  assessment: null,
  ...over,
});

const settings = {
  dueSoonEnabled: true,
  dueSoonDays: 1,
  overdueEnabled: true,
  staleEnabled: false,
  staleDays: 7,
  dailyLogEnabled: false,
  dailyLogTime: "18:00",
  timeZone: "UTC",
  assessmentEnabled: true,
};

function mockLists(pending: unknown[], done: unknown[] = []) {
  vi.mocked(api.fetchReminders).mockImplementation(async (status) => (status === "done" ? done : pending) as never);
}

const renderPage = () => render(<MemoryRouter><RemindersPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchReminderSettings).mockResolvedValue(settings as never);
  vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
  vi.mocked(api.fetchAllEntries).mockResolvedValue({ entries: [], truncated: false, fieldsByProject: {}, projectsNeedingFields: [] } as never);
});

describe("RemindersPage — viewing reminders (AT2, AT3)", () => {
  it("shows reminders whose time has come under Due now, and later ones under Upcoming", async () => {
    mockLists([
      reminder({ id: "due", title: "Email supervisor" }),
      reminder({ id: "later", title: "Book lab slot", remindAt: new Date(Date.now() + HOUR).toISOString() }),
    ]);
    renderPage();

    expect(await screen.findByText("Email supervisor")).toBeInTheDocument();
    expect(screen.queryByText("Book lab slot")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /upcoming/i }));
    expect(screen.getByText("Book lab slot")).toBeInTheDocument();
    expect(screen.queryByText("Email supervisor")).not.toBeInTheDocument();
  });

  it("labels generated reminders by the rule that produced them and links their entry", async () => {
    mockLists([
      reminder({
        id: "g1",
        source: "OVERDUE",
        title: "Overdue: Lab report",
        entry: { id: "e1", projectId: "p1", projectName: "Chemistry", label: "Lab report", dueDate: "2026-09-20T00:00:00.000Z", status: "OPEN" },
      }),
    ]);
    renderPage();

    const card = await screen.findByTestId("reminder");
    expect(within(card).getByText("Overdue")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Chemistry" })).toHaveAttribute("href", "/projects/p1");
  });

  it("labels an assessment reminder and links its module in My Grades (FEAT-009)", async () => {
    mockLists([
      reminder({
        id: "a1",
        source: "ASSESSMENT",
        title: "Test on Sun 15 Nov: COMS3011A Final Test",
        assessment: { id: "as1", moduleId: "m1", moduleCode: "COMS3011A", name: "Final Test", date: "2026-11-15", dateKind: "TEST" },
      }),
    ]);
    renderPage();

    const card = await screen.findByTestId("reminder");
    expect(within(card).getByText("Assessment")).toBeInTheDocument();
    expect(within(card).getByText("Test on Sun 15 Nov: COMS3011A Final Test")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "COMS3011A" })).toHaveAttribute("href", "/grades/m1");
    // Generated, so it can be dismissed but not deleted.
    expect(within(card).queryByRole("button", { name: "Delete reminder" })).toBeNull();
  });

  it("shows an empty state when nothing is due", async () => {
    mockLists([]);
    renderPage();
    expect(await screen.findByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it("shows an error with a retry when loading fails", async () => {
    vi.mocked(api.fetchReminders).mockRejectedValue({ response: { data: { error: "Server down" } } });
    renderPage();
    expect(await screen.findByText("Server down")).toBeInTheDocument();

    mockLists([reminder()]);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Email supervisor")).toBeInTheDocument();
  });
});

describe("RemindersPage — completing and dismissing (AT4)", () => {
  it("moves a completed reminder into the history tab", async () => {
    mockLists([reminder()]);
    vi.mocked(api.updateReminder).mockResolvedValue(
      reminder({ status: "COMPLETED", completedAt: new Date().toISOString() }) as never
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /complete/i }));
    await waitFor(() => expect(api.updateReminder).toHaveBeenCalledWith("r1", { status: "COMPLETED" }));
    await waitFor(() => expect(screen.queryByText("Email supervisor")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /completed/i }));
    expect(screen.getByText("Email supervisor")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("dismisses a reminder", async () => {
    mockLists([reminder()]);
    vi.mocked(api.updateReminder).mockResolvedValue(reminder({ status: "DISMISSED" }) as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(api.updateReminder).toHaveBeenCalledWith("r1", { status: "DISMISSED" }));
    await waitFor(() => expect(screen.queryByText("Email supervisor")).not.toBeInTheDocument());
  });

  it("reopens a finished reminder", async () => {
    mockLists([], [reminder({ status: "DISMISSED" })]);
    vi.mocked(api.updateReminder).mockResolvedValue(reminder() as never);
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: /completed/i }));
    fireEvent.click(await screen.findByRole("button", { name: /reopen/i }));
    await waitFor(() => expect(api.updateReminder).toHaveBeenCalledWith("r1", { status: "PENDING" }));

    fireEvent.click(screen.getByRole("tab", { name: /due now/i }));
    expect(await screen.findByText("Email supervisor")).toBeInTheDocument();
  });

  it("only offers delete for reminders set by hand", async () => {
    mockLists([reminder({ id: "m" }), reminder({ id: "g", source: "DUE_SOON", title: "Due soon: X" })]);
    renderPage();
    await screen.findByText("Due soon: X");
    expect(screen.getAllByRole("button", { name: /delete reminder/i })).toHaveLength(1);
  });

  it("reports a failed update", async () => {
    mockLists([reminder()]);
    vi.mocked(api.updateReminder).mockRejectedValue({ response: { data: { error: "Reminder not found" } } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /complete/i }));
    expect(await screen.findByText("Reminder not found")).toBeInTheDocument();
  });
});

describe("RemindersPage — creating a reminder", () => {
  it("saves a new reminder with its time", async () => {
    mockLists([]);
    const later = new Date(Date.now() + 2 * HOUR).toISOString();
    vi.mocked(api.createReminder).mockResolvedValue(reminder({ id: "new", title: "Check results", remindAt: later }) as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /new reminder/i }));
    fireEvent.change(screen.getByPlaceholderText(/email my supervisor/i), { target: { value: "Check results" } });
    fireEvent.change(screen.getByLabelText(/remind me at/i), { target: { value: "2030-01-01T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save reminder/i }));

    await waitFor(() => expect(api.createReminder).toHaveBeenCalledWith({
      title: "Check results",
      note: null,
      remindAt: new Date("2030-01-01T09:00").toISOString(),
      entryId: null,
    }));
    // It is for later, so the page switches to where it now lives.
    expect(await screen.findByText("Check results")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /upcoming/i })).toHaveAttribute("aria-selected", "true");
  });

  it("requires a title", async () => {
    mockLists([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new reminder/i }));
    fireEvent.click(screen.getByRole("button", { name: /save reminder/i }));
    expect(await screen.findByText("Give the reminder a title.")).toBeInTheDocument();
    expect(api.createReminder).not.toHaveBeenCalled();
  });
});

describe("RemindersPage — rules (AT1)", () => {
  it("saves the rules with this device's time zone and reloads the reminders", async () => {
    mockLists([]);
    vi.mocked(api.updateReminderSettings).mockImplementation(async (data) => ({ ...settings, ...data }) as never);
    renderPage();

    fireEvent.click(await screen.findByRole("switch", { name: /stalled entries/i }));
    fireEvent.change(screen.getByLabelText(/days without progress/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /save rules/i }));

    await waitFor(() => expect(api.updateReminderSettings).toHaveBeenCalledWith(expect.objectContaining({
      staleEnabled: true,
      staleDays: 3,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })));
    expect(await screen.findByText("Rules saved.")).toBeInTheDocument();
    // Initial load (pending + done), then again after saving.
    await waitFor(() => expect(api.fetchReminders).toHaveBeenCalledTimes(4));
  });

  it("switches assessment reminders off (FEAT-009)", async () => {
    mockLists([]);
    vi.mocked(api.updateReminderSettings).mockImplementation(async (data) => ({ ...settings, ...data }) as never);
    renderPage();

    const toggle = await screen.findByRole("switch", { name: /upcoming tests & assessments/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save rules/i }));
    await waitFor(() =>
      expect(api.updateReminderSettings).toHaveBeenCalledWith(expect.objectContaining({ assessmentEnabled: false }))
    );
  });

  it("hides a rule's options while it is off", async () => {
    mockLists([]);
    renderPage();
    expect(await screen.findByLabelText(/days before due date/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /upcoming due dates/i }));
    expect(screen.queryByLabelText(/days before due date/i)).not.toBeInTheDocument();
  });
});
