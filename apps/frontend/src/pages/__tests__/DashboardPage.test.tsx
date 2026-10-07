import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Mock the API module so no network calls happen
vi.mock("../../api", () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    { id: "p1", name: "Alpha Project", status: "ACTIVE", description: null },
    { id: "p2", name: "Beta Project", status: "ARCHIVED", description: null },
  ]),
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  fetchEntries: vi.fn().mockResolvedValue([]),
  // The dashboard moved to the user-scoped listing endpoint. Without this
  // entry the page's loader threw on every render and the catch block
  // swallowed it, so these tests passed while the data path was broken.
  fetchAllEntries: vi.fn().mockResolvedValue({
    entries: [],
    truncated: false,
    fieldsByProject: {},
    projectsNeedingFields: [],
  }),
  // US19: layouts are saved to the account. Null = never saved.
  fetchDashboardLayout: vi.fn().mockResolvedValue(null),
  saveDashboardLayout: vi.fn().mockResolvedValue(undefined),
  resetDashboardLayout: vi.fn().mockResolvedValue(undefined),
  // US18: saved statistics offered as panels.
  fetchProjectStatistics: vi.fn().mockResolvedValue([]),
  fetchProjectStatistic: vi.fn(),
  // The "today" section: modules from My Grades and the student's reminders.
  fetchGradeModules: vi.fn().mockResolvedValue([]),
  fetchReminders: vi.fn().mockResolvedValue([]),
}));

import DashboardPage from "../../pages/DashboardPage";
import { localDateKey } from "../../lib/utils";
import { DASHBOARD_PANELS, DEFAULT_DASHBOARD_PANELS } from "../../lib/dashboardPreferences";

/** A student who has added every panel, for tests about arranging and the panels themselves. */
const showEveryPanel = () => localStorage.setItem("logbook-dashboard-panels", JSON.stringify(DASHBOARD_PANELS));

function renderDashboard() {
  localStorage.setItem("logbook-name", "Test Student");
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the greeting with the user's name", async () => {
    renderDashboard();

    // The greeting changes based on time of day, so use a partial match
    expect(
      await screen.findByText(/Test Student/),
    ).toBeInTheDocument();
  });

  it("does not repeat the statistics the Statistics page already shows", async () => {
    // The client asked for this at the 2026-09-18 meeting: the dashboard was
    // duplicating a feature that already has its own page in the side
    // navigation. Asserting the absence keeps it removed.
    renderDashboard();
    await screen.findByText(/Test Student/);

    expect(screen.queryByText("Active Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Entries This Week")).not.toBeInTheDocument();
    expect(screen.queryByText("Total Time Logged")).not.toBeInTheDocument();
  });

  it("renders the New Project button", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("button", { name: /new project/i }),
    ).toBeInTheDocument();
  });

  it("lets a student remove a dashboard panel and restores that choice", async () => {
    const user = userEvent.setup();
    const firstRender = renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("checkbox", { name: /activity/i }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));

    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(localStorage.getItem("logbook-dashboard-panels")).not.toContain("activity");

    firstRender.unmount();
    renderDashboard();
    expect(await screen.findByText(/Test Student/)).toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
  });

  it("saves a rearranged dashboard layout and restores its panel order", async () => {
    showEveryPanel();
    const user = userEvent.setup();
    const firstRender = renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("button", { name: "Move Activity up" }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));

    const savedPanels = JSON.parse(localStorage.getItem("logbook-dashboard-panels") || "[]");
    expect(savedPanels.indexOf("activity")).toBeLessThan(savedPanels.indexOf("deadline-reminders"));

    firstRender.unmount();
    renderDashboard();
    const activity = await screen.findByText("Activity");
    const deadlines = screen.getByText("Deadlines");
    expect(activity.compareDocumentPosition(deadlines) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts a new dashboard with a few panels, leaving deadlines and charts to Today and Statistics", async () => {
    renderDashboard();
    expect(await screen.findByText("Activity")).toBeInTheDocument();
    expect(screen.queryByText("Deadlines")).not.toBeInTheDocument();
    expect(screen.queryByText("Tag ranking")).not.toBeInTheDocument();
    expect(screen.queryByText("Compare weeks")).not.toBeInTheDocument();
  });

  it("restores the original dashboard layout immediately", async () => {
    showEveryPanel();
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("button", { name: "Move Activity up" }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));
    await user.click(screen.getByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("button", { name: /restore defaults/i }));

    expect(screen.queryByRole("dialog", { name: /customize dashboard/i })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("logbook-dashboard-panels") || "[]")).toEqual(DEFAULT_DASHBOARD_PANELS);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.queryByText("Deadlines")).not.toBeInTheDocument();
  });

  it("expands an unpaired custom panel instead of retaining an empty grid slot", async () => {
    localStorage.setItem("logbook-dashboard-panels", JSON.stringify(["activity", "tags", "recent-entries"]));
    renderDashboard();

    const recentEntriesPanel = await screen.findByRole("region", { name: "Recent entries" });
    expect(recentEntriesPanel).toHaveClass("lg:col-span-6");
  });

  it("lets a student drag a panel to a new position and saves the layout", async () => {
    showEveryPanel();
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /arrange panels/i }));
    const activity = screen.getByRole("region", { name: "Activity" });
    const tags = screen.getByRole("region", { name: "Tags" });
    const transfer = {
      setData: vi.fn(),
      getData: () => "activity",
      effectAllowed: "move",
      dropEffect: "move",
    };

    fireEvent.dragStart(activity, { dataTransfer: transfer });
    fireEvent.dragOver(tags, { dataTransfer: transfer });
    fireEvent.drop(tags, { dataTransfer: transfer });

    const savedPanels = JSON.parse(localStorage.getItem("logbook-dashboard-panels") || "[]");
    expect(savedPanels.indexOf("activity")).toBeLessThan(savedPanels.indexOf("tags"));
    expect(transfer.setData).toHaveBeenCalledWith("text/plain", "activity");
  });

  // ── Insight panels: streak, monthly counts, progress, tags, weeks ─────

  it("shows the streak, progress, monthly, tag-ranking and week-comparison panels", async () => {
    showEveryPanel();
    const { fetchAllEntries } = await import("../../api");
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return localDateKey(d);
    };
    const make = (id: string, date: string, tags: string[]) => ({
      id, projectId: "p1", durationMinutes: 30, entryDate: `${date}T00:00:00.000Z`,
      createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`,
      dueDate: null, values: {}, format: null, tags, status: "OPEN", completedAt: null,
    });
    vi.mocked(fetchAllEntries).mockResolvedValueOnce({
      entries: [make("e1", day(0), ["lab", "essay"]), make("e2", day(1), ["lab"]), make("e3", day(2), ["lab"])],
      truncated: false,
      fieldsByProject: {},
      projectsNeedingFields: [],
    } as any);
    renderDashboard();

    expect(await screen.findByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("Entry Streak")).toBeInTheDocument();
    expect(screen.getByText("Progress Over Time")).toBeInTheDocument();
    expect(screen.getByText("Entries per Month")).toBeInTheDocument();

    const ranking = screen.getByText("Tag Ranking").closest(".bg-white") as HTMLElement;
    expect(within(ranking).getByText("1. lab")).toBeInTheDocument();
    expect(within(ranking).getByText("3 entries")).toBeInTheDocument();
    expect(within(ranking).getByText("2. essay")).toBeInTheDocument();

    const weeks = screen.getByText("Compare weeks").closest(".bg-white") as HTMLElement;
    expect(within(weeks).getAllByRole("combobox")).toHaveLength(2);
    expect(within(weeks).getByRole("rowheader", { name: "Entries" })).toBeInTheDocument();
  });

  it("summarises a checklist or reference entry by its labels in Recent Entries", async () => {
    const { fetchAllEntries } = await import("../../api");
    const today = localDateKey(new Date());
    const make = (id: string, values: Record<string, unknown>) => ({
      id, projectId: "p1", durationMinutes: 0, entryDate: `${today}T00:00:00.000Z`,
      createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:00:00.000Z`,
      dueDate: null, values, format: null, tags: [], status: "OPEN", completedAt: null,
    });
    vi.mocked(fetchAllEntries).mockResolvedValueOnce({
      entries: [
        make("e1", { list: [{ label: "Buy milk", checked: true }, { label: "Eggs", checked: false }] }),
        make("e2", { ref: { id: "x", label: "Thesis draft" } }),
      ],
      truncated: false,
      fieldsByProject: {
        p1: [
          { id: "list", name: "Shopping", type: "CHECKLIST" },
          { id: "ref", name: "Related", type: "REFERENCE" },
        ],
      },
      projectsNeedingFields: [],
    } as any);
    renderDashboard();

    expect(await screen.findByText("Buy milk, Eggs")).toBeInTheDocument();
    expect(screen.getByText("Thesis draft")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it("renders the Activity chart section", async () => {
    renderDashboard();

    expect(await screen.findByText("Activity")).toBeInTheDocument();
  });

  it("renders Current Projects section", async () => {
    renderDashboard();

    expect(
      await screen.findByText("Current Projects"),
    ).toBeInTheDocument();
  });

  // Every other assertion here checks a static label, which renders whether
  // or not the data arrived — which is exactly how a broken mock went
  // unnoticed. This one fails if the loader stops reaching the endpoint.
  it("loads entries through the user-scoped listing endpoint", async () => {
    const { fetchAllEntries } = await import("../../api");
    renderDashboard();

    await screen.findByText(/Test Student/);
    await waitFor(() => expect(fetchAllEntries).toHaveBeenCalled());

    expect(vi.mocked(fetchAllEntries).mock.calls[0][0]).toMatchObject({
      projectStatus: "ACTIVE",
      limit: 500,
    });
  });

  it("shows 'No active projects' when all projects are archived", async () => {
    // Override the mock to return only archived projects
    const { fetchProjects } = await import("../../api");
    vi.mocked(fetchProjects).mockResolvedValueOnce([
      { id: "p1", name: "Old", status: "ARCHIVED", description: null },
    ] as any);

    renderDashboard();

    expect(
      await screen.findByText(/no active projects/i),
    ).toBeInTheDocument();
  });
  // ── US19: the layout is saved to the account ───────────────────────────

  it("shows the layout saved to the account, even on a new device", async () => {
    const { fetchDashboardLayout } = await import("../../api");
    vi.mocked(fetchDashboardLayout).mockResolvedValueOnce(["tags", "activity"]);
    renderDashboard();

    const tags = await screen.findByRole("region", { name: "Tags" });
    const activity = screen.getByRole("region", { name: "Activity" });
    expect(tags.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Recent Entries")).not.toBeInTheDocument();
  });

  it("saves a changed layout to the account", async () => {
    const { saveDashboardLayout } = await import("../../api");
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("checkbox", { name: /activity/i }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));

    await waitFor(() => expect(saveDashboardLayout).toHaveBeenCalled());
    expect(vi.mocked(saveDashboardLayout).mock.calls.at(-1)![0]).not.toContain("activity");
  });

  it("warns when the layout couldn't be saved to the account", async () => {
    const { saveDashboardLayout } = await import("../../api");
    vi.mocked(saveDashboardLayout).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));

    expect(await screen.findByText(/couldn't be saved to your account/i)).toBeInTheDocument();
  });

  // ── US18: saved statistics as dashboard panels ─────────────────────────

  const PROJECT = "11111111-1111-4111-8111-111111111111";
  const STAT = "22222222-2222-4222-8222-222222222222";
  const statistic = {
    id: STAT, projectId: PROJECT, name: "Average hours", expression: "avg(Hours)",
    value: 3.456, error: null, createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z",
  };

  async function withStatisticProject() {
    const api = await import("../../api");
    vi.mocked(api.fetchProjects).mockResolvedValueOnce([
      { id: PROJECT, name: "Thesis", status: "ACTIVE", description: null },
    ] as any);
    return api;
  }

  it("adds a saved statistic to the dashboard as a panel", async () => {
    const api = await withStatisticProject();
    vi.mocked(api.fetchProjectStatistics).mockResolvedValueOnce([statistic]);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /customize dashboard/i }));
    await user.click(await screen.findByRole("checkbox", { name: /average hours/i }));
    await user.click(screen.getByRole("button", { name: /save dashboard/i }));

    const panel = await screen.findByRole("region", { name: "Average hours" });
    expect(panel).toHaveTextContent((3.46).toLocaleString());
    expect(panel).toHaveTextContent("Average hours · Thesis");
    expect(vi.mocked(api.saveDashboardLayout).mock.calls.at(-1)![0]).toContain(`stat:${PROJECT}:${STAT}`);
  });

  it("shows a saved statistic's current value when the dashboard opens", async () => {
    const api = await withStatisticProject();
    vi.mocked(api.fetchDashboardLayout).mockResolvedValueOnce([`stat:${PROJECT}:${STAT}`]);
    vi.mocked(api.fetchProjectStatistic).mockResolvedValueOnce({ ...statistic, value: 12 });
    renderDashboard();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(api.fetchProjectStatistic).toHaveBeenCalledWith(PROJECT, STAT);
  });

  it("offers to remove the panel of a statistic that was deleted", async () => {
    const api = await withStatisticProject();
    vi.mocked(api.fetchDashboardLayout).mockResolvedValueOnce([`stat:${PROJECT}:${STAT}`, "tags"]);
    vi.mocked(api.fetchProjectStatistic).mockRejectedValueOnce({ response: { status: 404 } });
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText("This statistic was deleted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove panel/i }));

    expect(screen.queryByText("This statistic was deleted")).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.saveDashboardLayout).mock.calls.at(-1)![0]).toEqual(["tags"]));
  });
});

// ── Today: what do I need to know? ─────────────────────────────────────

describe("DashboardPage — today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("logbook-note-dismissed");
  });

  it("lists what's next from My Grades and the student's reminders in one place", async () => {
    const api = await import("../../api");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const inThree = new Date();
    inThree.setDate(inThree.getDate() + 3);
    vi.mocked(api.fetchGradeModules).mockResolvedValueOnce([
      {
        id: "m1", code: "MATH2015", name: "Discrete Maths", academicYear: new Date().getFullYear(),
        type: "SEMESTER", semester: 2, semester1Weight: null, targetMark: null, createdAt: "", updatedAt: "",
        assessments: [{
          id: "a1", moduleId: "m1", name: "Tutorial test 2", section: null, weight: 100,
          markObtained: null, markMax: null, markPercent: null, missed: false,
          date: localDateKey(tomorrow), dateKind: "TEST", remind: true, position: 0, createdAt: "", updatedAt: "",
        }],
      },
    ] as never);
    vi.mocked(api.fetchReminders).mockResolvedValueOnce([
      { id: "r1", title: "Book study room", note: null, source: "MANUAL", status: "PENDING",
        remindAt: `${localDateKey(inThree)}T09:00:00`, completedAt: null, dismissedAt: null, createdAt: "", entry: null, assessment: null },
    ] as never);
    renderDashboard();

    const nextUp = await screen.findByRole("region", { name: "Next up" });
    await within(nextUp).findByText("Tutorial test 2");
    const items = within(nextUp).getAllByRole("link");
    expect(items[0]).toHaveTextContent("Tutorial test 2");
    expect(items[0]).toHaveTextContent("MATH2015");
    expect(items[0]).toHaveTextContent("Tomorrow");
    expect(items[0]).toHaveAttribute("href", "/grades/m1");
    expect(items[1]).toHaveTextContent("Book study room");
    expect(items[1]).toHaveTextContent("In 3 days");

    const modules = screen.getByRole("region", { name: "Modules at a glance" });
    expect(within(modules).getByRole("link", { name: /MATH2015/ })).toHaveAttribute("href", "/grades/m1");
  });

  it("says plainly when nothing needs attention", async () => {
    renderDashboard();
    const radar = await screen.findByRole("region", { name: "On your radar" });
    expect(await within(radar).findByText("Nothing needs your attention right now.")).toBeInTheDocument();
  });

  it("shows a daily note that can be put away until tomorrow", async () => {
    const user = userEvent.setup();
    const first = renderDashboard();
    const note = await screen.findByRole("complementary", { name: "Today's note" });
    expect(note.textContent?.trim().length).toBeGreaterThan(0);
    await user.click(within(note).getByRole("button", { name: "Hide today's note" }));
    expect(screen.queryByRole("complementary", { name: "Today's note" })).toBeNull();

    first.unmount();
    renderDashboard();
    await screen.findByText(/Test Student/);
    expect(screen.queryByRole("complementary", { name: "Today's note" })).toBeNull();
  });

  it("offers a few quick actions, with New entry first", async () => {
    renderDashboard();
    const actions = await screen.findByRole("group", { name: "Quick actions" });
    expect(within(actions).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual([
      "New entry", "Add assessment", "New reminder",
    ]);
  });
});
