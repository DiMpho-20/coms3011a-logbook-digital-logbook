import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  fetchAllEntries: vi.fn(),
  fetchTags: vi.fn().mockResolvedValue([]),
}));

import * as api from "../../api";
import EntriesPage from "../EntriesPage";

const SUMMARY_FIELD = { id: "f-sum", name: "Summary", type: "TEXT", required: false };
const MOOD_FIELD = { id: "f-mood", name: "Mood", type: "TEXT", required: false };

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Campus Marketplace",
  description: null,
  status: "ACTIVE",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  projectId: "p1",
  durationMinutes: 45,
  entryDate: null,
  dueDate: null,
  values: { "f-sum": "Wrote the report" },
  status: "OPEN",
  completedAt: null,
  tags: [],
  format: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

const listing = (entries: unknown[], over: Record<string, unknown> = {}) => ({
  entries,
  truncated: false,
  fieldsByProject: { p1: [SUMMARY_FIELD], p2: [SUMMARY_FIELD] },
  projectsNeedingFields: [],
  ...over,
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.fetchTags).mockResolvedValue([] as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue([] as never);
});

describe("EntriesPage — shell and loading", () => {
  it("waits on the projects before rendering anything", () => {
    vi.mocked(api.fetchProjects).mockReturnValue(new Promise(() => {}) as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing([]) as never);
    render(<EntriesPage />);

    expect(screen.getByText("Loading entries...")).toBeInTheDocument();
  });

  it("renders the shell with placeholders while the entries are still coming", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchAllEntries).mockReturnValue(new Promise(() => {}) as never);
    render(<EntriesPage />);

    // The header and the stat labels do not need entries. ("This Week" is
    // deliberately not used here — it is also a filter option, so it matches
    // twice; "Total Entries" and "Day Streak" are stat labels only.)
    expect(await screen.findByText("Entries")).toBeInTheDocument();
    expect(screen.getByText("Total Entries")).toBeInTheDocument();
    expect(screen.getByText("Day Streak")).toBeInTheDocument();
    // And the list shows a busy placeholder rather than an empty state.
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("asks for the active projects' entries in one request", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Archived thing", status: "ARCHIVED" }),
    ] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing([]) as never);
    render(<EntriesPage />);

    await waitFor(() => expect(api.fetchAllEntries).toHaveBeenCalled());
    const [query, options] = vi.mocked(api.fetchAllEntries).mock.calls[0];
    expect(query).toMatchObject({ projectStatus: "ACTIVE", limit: 500 });
    // Only the active project's queued entries belong on this page.
    expect(options).toMatchObject({ pendingProjectIds: ["p1"] });
  });

  it("says so when there are no active projects at all", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project({ status: "ARCHIVED" }),
    ] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing([]) as never);
    render(<EntriesPage />);

    expect(await screen.findByText("No active projects")).toBeInTheDocument();
  });

  it("only fetches field lists for projects that need a fallback", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(
      listing([entry()], { projectsNeedingFields: ["p1"] }) as never
    );
    render(<EntriesPage />);

    await waitFor(() => expect(api.fetchEntryFields).toHaveBeenCalledWith("p1"));
    expect(api.fetchEntryFields).toHaveBeenCalledTimes(1);
  });

  it("warns when the response was capped", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing([entry()], { truncated: true }) as never);
    render(<EntriesPage />);

    expect(await screen.findByText(/most recent 500 entries/i)).toBeInTheDocument();
  });
});

describe("EntriesPage — the timeline", () => {
  const setup = async (entries: unknown[], projects = [project()]) => {
    vi.mocked(api.fetchProjects).mockResolvedValue(projects as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing(entries) as never);
    render(<EntriesPage />);
    await screen.findByText("Entries");
  };

  it("shows an entry with its description, project and duration", async () => {
    await setup([entry()]);

    expect(await screen.findByText("Wrote the report")).toBeInTheDocument();
    expect(screen.getAllByText("Campus Marketplace").length).toBeGreaterThan(0);
    // "45m" renders twice: the entry's own duration, and the "Time This Week"
    // total — which is the same figure when this is the only entry.
    expect(screen.getAllByText("45m")).toHaveLength(2);
  });

  it("chips the other fields but not the one already shown as the description", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(
      listing(
        [entry({ values: { "f-sum": "Wrote the report", "f-mood": "Focused" } })],
        { fieldsByProject: { p1: [SUMMARY_FIELD, MOOD_FIELD] } }
      ) as never
    );
    render(<EntriesPage />);

    // The second field earns a chip...
    expect(await screen.findByText("Focused")).toBeInTheDocument();
    // ...while the description is not repeated as one underneath itself.
    expect(screen.getAllByText("Wrote the report")).toHaveLength(1);
  });

  it("counts the entries into the stat cards", async () => {
    await setup([entry(), entry({ id: "e2", durationMinutes: 15 })]);

    // Total Entries — 2, once the entries land.
    await waitFor(() => expect(screen.getAllByText("2").length).toBeGreaterThan(0));
  });

  it("marks an overdue entry and counts it", async () => {
    await setup([entry({ dueDate: daysAgo(2) })]);

    // "Overdue" renders twice: the stat-card label, and the badge on the entry
    // itself. Both are expected — the badge is what marks the entry.
    expect(await screen.findAllByText("Overdue")).toHaveLength(2);
    // The filter option carries the count, so it reads "Overdue (1)".
    expect(screen.getByText("Overdue (1)")).toBeInTheDocument();
  });

  it("filters by the search box across project name and values", async () => {
    await setup([
      entry(),
      entry({ id: "e2", values: { "f-sum": "Something else entirely" } }),
    ]);

    await screen.findByText("Wrote the report");
    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "entirely" } });

    expect(screen.getByText("Something else entirely")).toBeInTheDocument();
    expect(screen.queryByText("Wrote the report")).not.toBeInTheDocument();
  });

  it("offers to clear the filters when nothing matches", async () => {
    await setup([entry()]);

    await screen.findByText("Wrote the report");
    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "zzzz" } });

    expect(await screen.findByText("No entries match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(await screen.findByText("Wrote the report")).toBeInTheDocument();
  });

  it("congratulates the user when the overdue view is empty", async () => {
    await setup([entry()]);
    await screen.findByText("Wrote the report");

    const tabSelect = screen.getAllByRole("combobox").find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "overdue")
    )!;
    fireEvent.change(tabSelect, { target: { value: "overdue" } });

    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
  });

  it("filters down to a single project", async () => {
    await setup(
      [entry(), entry({ id: "e2", projectId: "p2", values: { "f-sum": "Other project work" } })],
      [project(), project({ id: "p2", name: "Digital Logbook" })]
    );

    await screen.findByText("Wrote the report");

    const projectSelect = screen.getAllByRole("combobox").find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "p2")
    )!;
    fireEvent.change(projectSelect, { target: { value: "p2" } });

    expect(screen.getByText("Other project work")).toBeInTheDocument();
    expect(screen.queryByText("Wrote the report")).not.toBeInTheDocument();
  });

  it("switches between newest and oldest first", async () => {
    await setup([entry()]);
    await screen.findByText("Wrote the report");

    const toggle = screen.getByRole("button", { name: /newest/i });
    fireEvent.click(toggle);

    expect(await screen.findByRole("button", { name: /oldest/i })).toBeInTheDocument();
  });
});

describe("EntriesPage — saved filters", () => {
  const setup = async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchAllEntries).mockResolvedValue(listing([entry()]) as never);
    render(<EntriesPage />);
    await screen.findByText("Wrote the report");
  };

  it("offers to save only once a filter is actually active", async () => {
    await setup();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "report" } });
    expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves a named filter and applies it again", async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    fireEvent.change(screen.getByPlaceholderText(/Name this filter/), { target: { value: "Reports" } });
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }));

    // The chip persists through localStorage.
    expect(await screen.findByRole("button", { name: "Reports" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));

    expect(screen.getByPlaceholderText("Search entries...")).toHaveValue("report");
  });

  it("deletes a saved filter", async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText("Search entries..."), { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByPlaceholderText(/Name this filter/), { target: { value: "Reports" } });
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }));

    await screen.findByRole("button", { name: "Reports" });
    fireEvent.click(screen.getByTitle('Delete "Reports"'));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument());
  });
});
