import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({ api: { get: vi.fn() } }));
// The sync panel fetches its own connection status; it is covered on its own
// and would only add noise (and network calls) to the calendar's tests.
vi.mock("../../components/GoogleCalendarSync", () => ({
  default: () => <div data-testid="google-sync" />,
}));

import { api } from "../../api/client";
import CalendarPage from "../CalendarPage";

// ── Fixtures ─────────────────────────────────────────────────────────────
// Entries are pinned to the 15th of whatever month the test runs in, so they
// always fall inside the grid the page opens on. entryDateKey takes the first
// ten characters of entryDate, and a cell's key is built the same way, so
// both sides agree without depending on the timezone.

const now = new Date();
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const DAY_KEY = `${MONTH}-15`;

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  projectId: "p1",
  entryDate: `${DAY_KEY}T12:00:00.000Z`,
  createdAt: `${DAY_KEY}T12:00:00.000Z`,
  durationMinutes: 45,
  values: {},
  ...over,
});

const PROJECTS = [
  { id: "p1", name: "Campus Marketplace" },
  { id: "p2", name: "Digital Logbook" },
];

const serve = (entries: unknown[] = [], projects = PROJECTS) =>
  ((url: string) =>
    Promise.resolve({ data: url === "/projects" ? projects : entries })) as never;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <CalendarPage />
    </MemoryRouter>
  );

const monthLabel = (date = now) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(serve());
});

describe("CalendarPage — getting started", () => {
  it("waits for the projects before drawing a calendar", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never);
    renderPage();

    expect(screen.getByText("Loading projects…")).toBeInTheDocument();
  });

  it("says so when there are no projects to show", async () => {
    vi.mocked(api.get).mockImplementation(serve([], []));
    renderPage();

    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });

  it("keeps going when the projects request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("offline"));
    renderPage();

    // The spinner has to stop even when nothing arrives.
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });

  it("picks the first project and asks for its entries", async () => {
    renderPage();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/projects/p1/entries"));
  });

  it("opens on the current month, with a full week of headings", async () => {
    renderPage();

    expect(await screen.findByText(monthLabel())).toBeInTheDocument();
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });
});

describe("CalendarPage — moving between months", () => {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  it("steps back and forward a month at a time", async () => {
    renderPage();
    await screen.findByText(monthLabel());

    const [back, forward] = screen.getAllByRole("button").filter((b) => b.querySelector("svg") && !b.textContent?.trim());
    fireEvent.click(back);
    expect(await screen.findByText(monthLabel(previous))).toBeInTheDocument();

    fireEvent.click(forward);
    expect(await screen.findByText(monthLabel())).toBeInTheDocument();
    fireEvent.click(forward);
    expect(await screen.findByText(monthLabel(next))).toBeInTheDocument();
  });

  it("comes back to this month when Today is pressed", async () => {
    renderPage();
    await screen.findByText(monthLabel());

    const [back] = screen.getAllByRole("button").filter((b) => b.querySelector("svg") && !b.textContent?.trim());
    fireEvent.click(back);
    await screen.findByText(monthLabel(previous));

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText(monthLabel())).toBeInTheDocument();
  });
});

describe("CalendarPage — entries on a day", () => {
  it("shows an entry's duration in its day cell", async () => {
    vi.mocked(api.get).mockImplementation(serve([entry()]));
    renderPage();

    expect(await screen.findByRole("button", { name: "45m" })).toBeInTheDocument();
  });

  it("shows only the first two, and offers the rest behind a count", async () => {
    vi.mocked(api.get).mockImplementation(
      serve([
        entry({ id: "a", durationMinutes: 10 }),
        entry({ id: "b", durationMinutes: 20 }),
        entry({ id: "c", durationMinutes: 30 }),
      ])
    );
    renderPage();

    expect(await screen.findByRole("button", { name: "10m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "20m" })).toBeInTheDocument();
    // The third is folded away rather than crowding the cell.
    expect(screen.queryByRole("button", { name: "30m" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1 more" })).toBeInTheDocument();
  });

  it("opens the day when an entry is clicked, listing all of them", async () => {
    vi.mocked(api.get).mockImplementation(
      serve([entry({ id: "a", durationMinutes: 10 }), entry({ id: "b", durationMinutes: 20 })])
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "10m" }));

    expect(await screen.findByText("10 min")).toBeInTheDocument();
    expect(screen.getByText("20 min")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open project" })[0]).toHaveAttribute(
      "href",
      "/projects/p1"
    );
  });

  it("opens the day from the folded-away count too", async () => {
    vi.mocked(api.get).mockImplementation(
      serve([entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c", durationMinutes: 5 })])
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "+1 more" }));

    expect(await screen.findByText("5 min")).toBeInTheDocument();
  });

  it("leaves a day with nothing on it unopenable", async () => {
    renderPage();
    await screen.findByText(monthLabel());

    // Every day number is a button, but only days with entries are enabled.
    const dayButtons = screen.getAllByRole("button").filter((b) => /^\d{1,2}$/.test(b.textContent ?? ""));
    expect(dayButtons.length).toBeGreaterThan(0);
    expect(dayButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows nothing for a project whose entries could not be loaded", async () => {
    vi.mocked(api.get).mockImplementation(((url: string) =>
      url === "/projects"
        ? Promise.resolve({ data: PROJECTS })
        : Promise.reject(new Error("nope"))) as never);
    renderPage();

    await screen.findByText(monthLabel());
    expect(screen.queryByRole("button", { name: "45m" })).not.toBeInTheDocument();
  });
});

describe("CalendarPage — switching project", () => {
  it("asks for the newly chosen project's entries", async () => {
    vi.mocked(api.get).mockImplementation(serve([entry()]));
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/projects/p1/entries"));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/projects/p2/entries"));
  });
});
