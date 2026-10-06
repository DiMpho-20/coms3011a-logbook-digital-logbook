import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  fetchAllProjectTimeSummaries: vi.fn().mockResolvedValue([
    { projectId: "p1", totalMinutes: 140, totalHours: 2.3, entryCount: 3, lastEntryAt: null },
  ]),
  createProject: vi.fn().mockResolvedValue({ id: "new-p" }),
  updateProject: vi.fn().mockResolvedValue({ id: "p1" }),
  toggleProjectStatus: vi.fn().mockResolvedValue({ id: "p1", status: "ARCHIVED" }),
  createEntryField: vi.fn().mockResolvedValue({ id: "new-f" }),
  updateEntryField: vi.fn().mockResolvedValue({ id: "f1" }),
  deleteEntryField: vi.fn().mockResolvedValue(undefined),
  fetchTags: vi.fn().mockResolvedValue([{ id: "t1", name: "coursework" }]),
}));

import * as api from "../../api";
import ProjectsPage from "../ProjectsPage";

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Campus Marketplace",
  description: "Second-hand trading",
  status: "ACTIVE",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderPage = () => render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

/**
 * With no projects yet the page offers "New Project" twice — once in the
 * header, once as the empty state's call to action. Either opens the same
 * modal, so these tests take the header's.
 */
const openNewProjectModal = async () =>
  fireEvent.click((await screen.findAllByRole("button", { name: /new project/i }))[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchTags).mockResolvedValue([{ id: "t1", name: "coursework" }] as never);
  vi.mocked(api.fetchAllProjectTimeSummaries).mockResolvedValue([
    { projectId: "p1", totalMinutes: 140, totalHours: 2.3, entryCount: 3, lastEntryAt: null },
  ] as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue([] as never);
});

describe("ProjectsPage — loading and listing", () => {
  it("shows a loading state before the projects arrive", () => {
    vi.mocked(api.fetchProjects).mockReturnValue(new Promise(() => {}) as never);
    renderPage();
    expect(screen.getByText("Loading projects...")).toBeInTheDocument();
  });

  it("lists the projects once they arrive", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    renderPage();

    expect(await screen.findByText("Campus Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Second-hand trading")).toBeInTheDocument();
  });

  it("offers a retry when the projects cannot be loaded", async () => {
    vi.mocked(api.fetchProjects).mockRejectedValueOnce(new Error("Network is down"));
    renderPage();

    expect(await screen.findByText(/network is down/i)).toBeInTheDocument();
  });

  it("invites a brand-new account to create a project, not to adjust filters", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    // The filter defaults to ACTIVE, so emptiness has to be decided by the
    // unfiltered list. Deciding it from the filter used to tell a new account
    // its search matched nothing and withhold the button it needed.
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first project to start logging entries.")).toBeInTheDocument();
    // Two offers of it now: the header's, and the empty state's.
    expect(screen.getAllByRole("button", { name: /new project/i })).toHaveLength(2);
  });

  it("says nothing matches when a filter hides every project", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project({ status: "ARCHIVED" })] as never);
    renderPage();

    // A project exists; the default ACTIVE filter is what is hiding it.
    expect(await screen.findByText("No matching projects")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your search or filters.")).toBeInTheDocument();
    // No call to action here — adjusting the filter is the way out.
    expect(screen.getAllByRole("button", { name: /new project/i })).toHaveLength(1);
  });

  it("hides archived projects by default and reveals them on request", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Old Coursework", status: "ARCHIVED" }),
    ] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    expect(screen.queryByText("Old Coursework")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ARCHIVED" } });
    expect(await screen.findByText("Old Coursework")).toBeInTheDocument();
    expect(screen.queryByText("Campus Marketplace")).not.toBeInTheDocument();
  });

  it("filters by the search box and explains an empty result", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Digital Logbook" }),
    ] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value: "logbook" } });

    expect(screen.getByText("Digital Logbook")).toBeInTheDocument();
    expect(screen.queryByText("Campus Marketplace")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value: "nothing matches" } });
    expect(await screen.findByText("No matching projects")).toBeInTheDocument();
  });

  it("matches on the description as well as the name", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value: "second-hand" } });

    expect(screen.getByText("Campus Marketplace")).toBeInTheDocument();
  });
});

describe("ProjectsPage — creating and editing", () => {
  it("validates that a project has a name", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    expect(await screen.findByText("Create New Project")).toBeInTheDocument();

    // Submit the form directly; the required attribute would otherwise stop
    // the event before the handler runs.
    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    expect(await screen.findByText("Project name is required.")).toBeInTheDocument();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("creates a project with the fields defined alongside it", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.change(screen.getByPlaceholderText("Enter project name..."), { target: { value: "New Project" } });
    fireEvent.change(screen.getByPlaceholderText("Brief description (optional)"), { target: { value: "A description" } });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));
    fireEvent.change(screen.getByPlaceholderText("Field name..."), { target: { value: "Hours" } });

    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    await waitFor(() => expect(api.createProject).toHaveBeenCalled());
    expect(vi.mocked(api.createProject).mock.calls[0][0]).toMatchObject({
      name: "New Project",
      description: "A description",
      status: "ACTIVE",
    });
    await waitFor(() => expect(api.createEntryField).toHaveBeenCalledWith("new-p", expect.objectContaining({ name: "Hours" })));
  });

  it("skips a field row left blank", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.change(screen.getByPlaceholderText("Enter project name..."), { target: { value: "P" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));

    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    await waitFor(() => expect(api.createProject).toHaveBeenCalled());
    expect(api.createEntryField).not.toHaveBeenCalled();
  });

  it("surfaces the server's message when saving fails", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    vi.mocked(api.createProject).mockRejectedValueOnce({
      response: { data: { error: "You already have a project with that name" } },
    });
    renderPage();

    await openNewProjectModal();
    fireEvent.change(screen.getByPlaceholderText("Enter project name..."), { target: { value: "Duplicate" } });
    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    expect(await screen.findByText("You already have a project with that name")).toBeInTheDocument();
  });

  it("opens an edit modal named after the project and loads its fields", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchEntryFields).mockResolvedValue([
      { id: "f1", name: "Hours", type: "NUMBER", required: false },
    ] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.click(screen.getByTitle("Edit project"));

    expect(await screen.findByText("Edit Campus Marketplace")).toBeInTheDocument();
    expect(api.fetchEntryFields).toHaveBeenCalledWith("p1");
    expect(await screen.findByDisplayValue("Hours")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Project" })).toBeInTheDocument();
  });

  it("shows the formula box only for a computed field", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));

    expect(screen.queryByPlaceholderText(/^Formula/)).not.toBeInTheDocument();

    const typeSelect = screen.getAllByRole("combobox").find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "COMPUTED")
    )!;
    fireEvent.change(typeSelect, { target: { value: "COMPUTED" } });

    expect(await screen.findByPlaceholderText(/^Formula/)).toBeInTheDocument();
  });

  it("saves a computed field after the Number field its formula names, using the new id", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    vi.mocked(api.createEntryField)
      .mockResolvedValueOnce({ id: "srv-hours" } as never)
      .mockResolvedValueOnce({ id: "srv-total" } as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.change(screen.getByPlaceholderText("Enter project name..."), { target: { value: "Pay" } });
    // Computed row first, to show the order it is written in doesn't matter.
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));
    const [computedName, hoursName] = screen.getAllByPlaceholderText("Field name...");
    const [computedType, hoursType] = screen.getAllByRole("combobox").filter((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "COMPUTED")
    );
    fireEvent.change(computedName, { target: { value: "Double hours" } });
    fireEvent.change(computedType, { target: { value: "COMPUTED" } });
    fireEvent.change(hoursName, { target: { value: "Hours" } });
    fireEvent.change(hoursType, { target: { value: "NUMBER" } });
    fireEvent.change(screen.getByPlaceholderText(/^Formula/), { target: { value: "{hours} * 2" } });
    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    await waitFor(() => expect(api.createEntryField).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createEntryField).mock.calls[0][1]).toMatchObject({ name: "Hours", type: "NUMBER" });
    expect(vi.mocked(api.createEntryField).mock.calls[1][1]).toMatchObject({
      name: "Double hours", type: "COMPUTED", formula: "{srv-hours} * 2",
    });
  });

  it("refuses a formula naming a missing field before creating the project", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.change(screen.getByPlaceholderText("Enter project name..."), { target: { value: "Pay" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));
    fireEvent.change(screen.getByPlaceholderText("Field name..."), { target: { value: "Total" } });
    const typeSelect = screen.getAllByRole("combobox").find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "COMPUTED")
    )!;
    fireEvent.change(typeSelect, { target: { value: "COMPUTED" } });
    fireEvent.change(screen.getByPlaceholderText(/^Formula/), { target: { value: "{Hours} * 2" } });
    fireEvent.submit(screen.getByPlaceholderText("Enter project name...").closest("form")!);

    expect(await screen.findByText(/no Number or Computed field with that name/)).toBeInTheDocument();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("shows a saved formula with field names when editing", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchEntryFields).mockResolvedValue([
      { id: "f1", name: "Hours", type: "NUMBER", required: true, formula: null },
      { id: "f2", name: "Double", type: "COMPUTED", required: false, formula: "{f1} * 2" },
    ] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.click(screen.getByTitle("Edit project"));

    expect(await screen.findByDisplayValue("{Hours} * 2")).toBeInTheDocument();
  });

  it("says so when a project's fields fail to load, instead of showing none", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    vi.mocked(api.fetchEntryFields).mockRejectedValueOnce(new Error("offline"));
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.click(screen.getByTitle("Edit project"));

    expect(await screen.findByText(/entry fields could not be loaded/)).toBeInTheDocument();
  });

  it("removes a field row again", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderPage();

    await openNewProjectModal();
    fireEvent.click(screen.getByRole("button", { name: "+ Add Field" }));
    expect(screen.getByPlaceholderText("Field name...")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Remove field"));
    expect(screen.queryByPlaceholderText("Field name...")).not.toBeInTheDocument();
  });
});

describe("ProjectsPage — archiving", () => {
  it("archives an active project and reloads", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
    renderPage();

    await screen.findByText("Campus Marketplace");
    fireEvent.click(screen.getByTitle("Archive"));

    await waitFor(() => expect(api.toggleProjectStatus).toHaveBeenCalledWith("p1", "ARCHIVED"));
  });

  it("unarchives an archived one", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([project({ status: "ARCHIVED" })] as never);
    renderPage();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ARCHIVED" } });
    fireEvent.click(await screen.findByTitle("Unarchive"));

    await waitFor(() => expect(api.toggleProjectStatus).toHaveBeenCalledWith("p1", "ACTIVE"));
  });
});
