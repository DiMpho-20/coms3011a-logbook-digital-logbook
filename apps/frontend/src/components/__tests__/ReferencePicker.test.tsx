import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockFetchAllEntries = vi.fn();
vi.mock("../../api", () => ({
  fetchAllEntries: (...args: unknown[]) => mockFetchAllEntries(...args),
}));

import ReferencePicker from "../../components/ReferencePicker";
import type { Project } from "../../api";

const PROJECTS: Project[] = [
  { id: "p1", name: "Alpha", status: "ACTIVE", description: null } as Project,
  { id: "p2", name: "Beta", status: "ACTIVE", description: null } as Project,
  { id: "p3", name: "Gamma", status: "ACTIVE", description: null } as Project,
];

const ENTRY = {
  id: "e9",
  projectId: "p2",
  entryDate: "2026-09-30T12:00:00.000Z",
  createdAt: "2026-09-30T12:00:00.000Z",
  durationMinutes: 30,
  values: { x: "chapter two notes" },
  status: "OPEN" as const,
  tags: [],
};

const listing = (entries: unknown[]) => ({
  entries,
  truncated: false,
  fieldsByProject: {},
  projectsNeedingFields: [],
});

const renderPicker = (props: Partial<React.ComponentProps<typeof ReferencePicker>> = {}) => {
  const onChange = vi.fn();
  render(
    <ReferencePicker
      projects={PROJECTS}
      currentProjectId="p1"
      value={null}
      onChange={onChange}
      className="select"
      {...props}
    />
  );
  return { onChange };
};

const optionValues = () =>
  Array.from((screen.getByRole("combobox") as HTMLSelectElement).options).map((o) => o.value);

/** The date part of an entry option's label, formatted the way the picker does. */
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAllEntries.mockResolvedValue(listing([]));
});

describe("ReferencePicker", () => {
  it("offers the other projects and leaves the one being logged against out", async () => {
    renderPicker();

    expect(optionValues()).toEqual(["", "p2", "p3"]);
    expect(mockFetchAllEntries).toHaveBeenCalledWith({ limit: 200 });
  });

  it("lists recent entries, named so a student can tell them from projects", async () => {
    mockFetchAllEntries.mockResolvedValue(listing([ENTRY]));
    renderPicker();

    expect(await screen.findByText(`Beta · ${dayOf(ENTRY.entryDate)} · chapter two notes`))
      .toBeInTheDocument();
  });

  it("does not offer the current project's own entries", async () => {
    mockFetchAllEntries.mockResolvedValue(listing([ENTRY, { ...ENTRY, id: "e-self", projectId: "p1" }]));
    renderPicker();

    await screen.findByText(/chapter two notes/);
    await waitFor(() => expect(optionValues()).not.toContain("e-self"));
  });

  it("submits a project choice as a project reference", async () => {
    const { onChange } = renderPicker();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "p2" } });

    expect(onChange).toHaveBeenCalledWith({ id: "p2", label: "Beta", kind: "project" });
  });

  it("submits an entry choice as an entry reference, carrying its project", async () => {
    mockFetchAllEntries.mockResolvedValue(listing([ENTRY]));
    const { onChange } = renderPicker();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "e9" } });

    expect(onChange).toHaveBeenCalledWith({
      id: "e9",
      label: `Beta · ${dayOf(ENTRY.entryDate)} · chapter two notes`,
      kind: "entry",
      projectId: "p2",
    });
  });

  it("clears the reference when nothing is picked", async () => {
    const { onChange } = renderPicker({ value: { id: "p2", label: "Beta", kind: "project" } });
    const picker = screen.getByRole("combobox");
    expect((picker as HTMLSelectElement).value).toBe("p2");

    fireEvent.change(picker, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps a stored reference from outside the recent pool visible", async () => {
    renderPicker({ value: { id: "e-old", label: "Reading · Aug 1", kind: "entry", projectId: "p2" } });

    const picker = await screen.findByRole("combobox");
    await waitFor(() => expect(optionValues()).toContain("e-old"));
    expect((picker as HTMLSelectElement).value).toBe("e-old");
  });

  it("hides the entry being edited from its own picker", async () => {
    mockFetchAllEntries.mockResolvedValue(listing([ENTRY, { ...ENTRY, id: "e-current" }]));
    renderPicker({ excludeEntryId: "e-current" });

    await screen.findByText(/chapter two notes/);
    await waitFor(() => expect(optionValues()).not.toContain("e-current"));
  });
});
