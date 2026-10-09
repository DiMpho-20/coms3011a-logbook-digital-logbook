import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EntryForm from "../../components/EntryForm";
import type { Project, EntryField } from "../../api";

// Mock the API module — createEntry, fetchEntryFields when the form loads a
// project's fields itself, and fetchAllEntries for the reference picker's
// pool of recent entries.
const mockCreateEntry = vi.fn();
const mockFetchEntryFields = vi.fn();
const mockFetchAllEntries = vi.fn();
vi.mock("../../api", () => ({
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
  fetchEntryFields: (...args: unknown[]) => mockFetchEntryFields(...args),
  fetchAllEntries: (...args: unknown[]) => mockFetchAllEntries(...args),
}));

// Mock Stopwatch since it uses setInterval internally
vi.mock("../../components/Stopwatch", () => ({
  default: () => <div data-testid="stopwatch">Stopwatch</div>,
}));

const PROJECTS: Project[] = [
  { id: "p1", name: "Alpha", status: "ACTIVE", description: null } as Project,
  { id: "p2", name: "Beta", status: "ACTIVE", description: null } as Project,
];

const FIELDS: EntryField[] = [
  { id: "f-text", name: "Description", type: "TEXT", required: true, formula: null } as EntryField,
  { id: "f-num", name: "Hours", type: "NUMBER", required: false, formula: null } as EntryField,
];

const NO_FIELDS: EntryField[] = [];

const RICH_FIELDS: EntryField[] = [
  { id: "f-hours", name: "Hours", type: "NUMBER", required: false, formula: null } as EntryField,
  { id: "f-tags", name: "Topics", type: "TAGS", required: false, formula: null } as EntryField,
  { id: "f-steps", name: "Steps", type: "CHECKLIST", required: false, formula: null } as EntryField,
  { id: "f-link", name: "Notes", type: "LINK", required: false, formula: null } as EntryField,
  { id: "f-ref", name: "Partner", type: "REFERENCE", required: false, formula: null } as EntryField,
  { id: "f-cost", name: "Cost", type: "COMPUTED", required: false, formula: "{f-hours} * 2" } as EntryField,
];

function renderForm(overrides: Partial<React.ComponentProps<typeof EntryForm>> = {}) {
  const onSave = vi.fn();
  const props = {
    projects: PROJECTS,
    fields: NO_FIELDS,
    onSave,
    ...overrides,
  };
  return { onSave, ...render(<EntryForm {...props} />) };
}

/**
 * React 19 controlled-input helper.
 */
function setNativeValue(element: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("EntryForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prefill carries across saves through localStorage; clear it so each
    // test starts from a blank logbook.
    localStorage.clear();
    // The reference picker fetches recent entries whenever a REFERENCE field
    // renders; default to an empty logbook.
    mockFetchAllEntries.mockResolvedValue({
      entries: [],
      truncated: false,
      fieldsByProject: {},
      projectsNeedingFields: [],
    });
  });

  it("renders the duration input and submit button", () => {
    renderForm();
    expect(screen.getByPlaceholderText(/0 if not started/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save entry/i }),
    ).toBeInTheDocument();
  });

  it("renders the project selector when projectId is not preset", () => {
    renderForm();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("hides the project selector when projectId is preset", () => {
    renderForm({ projectId: "p1" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders dynamic fields from the fields prop", () => {
    renderForm({ fields: FIELDS });
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Hours")).toBeInTheDocument();
  });

  it("treats a blank duration as 0 (work that hasn't started yet) rather than an error", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e3", durationMinutes: 0 });
    renderForm({ projectId: "p1" });

    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        durationMinutes: 0,
      }));
    });
  });

  it("accepts a duration of 0 for work that hasn't started yet", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e2", durationMinutes: 0 });
    renderForm({ projectId: "p1" });

    setNativeValue(screen.getByPlaceholderText(/0 if not started/i), "0");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        durationMinutes: 0,
      }));
    });
  });

  it("shows an error when a required field is empty", async () => {
    renderForm({ fields: FIELDS });

    // Set duration but leave required Description empty
    setNativeValue(screen.getByPlaceholderText(/0 if not started/i), "60");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    expect(
      await screen.findByText(/"Description" is required/i),
    ).toBeInTheDocument();
  });

  it("calls createEntry and onSave on successful submission", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 60 });
    const { onSave } = renderForm({ fields: FIELDS, projectId: "p1" });

    // Fill duration and required text field
    setNativeValue(screen.getByPlaceholderText(/0 if not started/i), "60");
    const textInputs = screen.getAllByRole("textbox");
    setNativeValue(textInputs[0], "Worked on testing");

    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        durationMinutes: 60,
      }));
    });
    expect(onSave).toHaveBeenCalledWith({ id: "e1", durationMinutes: 60 });
  });

  it("renders the stopwatch component", () => {
    renderForm();
    expect(screen.getByTestId("stopwatch")).toBeInTheDocument();
  });
});

describe("EntryForm: every field type the project's format uses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("splits a TAGS field's comma-separated input into a list", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    const tagInput = screen.getByPlaceholderText(/comma-separated/i);
    setNativeValue(tagInput, "design, testing");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        values: expect.objectContaining({ "f-tags": ["design", "testing"] }),
      }));
    });
  });

  it("collects CHECKLIST items and submits their labels", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    const addItem = screen.getByPlaceholderText(/add checklist item/i);
    setNativeValue(addItem, "Draft outline");
    fireEvent.keyDown(addItem, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        values: expect.objectContaining({
          "f-steps": [{ label: "Draft outline", checked: false }],
        }),
      }));
    });
  });

  it("submits a LINK field's URL as written", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    setNativeValue(screen.getByPlaceholderText(/https:/i), "https://example.edu/notes");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        values: expect.objectContaining({ "f-link": "https://example.edu/notes" }),
      }));
    });
  });

  it("submits a REFERENCE field as the chosen project", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    // The project selector is hidden (projectId preset), so the only
    // combobox is the reference picker.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        values: expect.objectContaining({
          "f-ref": { id: "p2", label: "Beta", kind: "project" },
        }),
      }));
    });
  });

  it("submits a REFERENCE field as a linked entry, project id included", async () => {
    const day = new Date("2026-09-30T12:00:00.000Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    mockFetchAllEntries.mockResolvedValue({
      entries: [
        {
          id: "e9",
          projectId: "p2",
          entryDate: "2026-09-30T12:00:00.000Z",
          createdAt: "2026-09-30T12:00:00.000Z",
          values: { x: "chapter notes" },
        },
      ],
      truncated: false,
      fieldsByProject: {},
      projectsNeedingFields: [],
    });
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    // The option names the entry so the student can tell it from a project.
    const option = await screen.findByText(`Beta · ${day} · chapter notes`);
    fireEvent.change(option.closest("select")!, { target: { value: "e9" } });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith("p1", expect.objectContaining({
        values: expect.objectContaining({
          "f-ref": { id: "e9", label: `Beta · ${day} · chapter notes`, kind: "entry", projectId: "p2" },
        }),
      }));
    });
  });

  it("shows a COMPUTED field's live value instead of an input", async () => {
    mockCreateEntry.mockResolvedValueOnce({ id: "e1", durationMinutes: 10 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    // Hours is the first spinbutton after the duration box.
    const spinbuttons = screen.getAllByRole("spinbutton");
    setNativeValue(spinbuttons[1], "3");

    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText(/calculated automatically from/i)).toBeInTheDocument();
  });

  it("loads the selected project's fields itself when none are passed in", async () => {
    mockFetchEntryFields.mockResolvedValueOnce([
      { id: "f-text", name: "Description", type: "TEXT", required: false, formula: null },
    ]);
    renderForm({ fields: undefined }); // no fields prop

    expect(mockFetchEntryFields).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Description")).toBeInTheDocument();
  });

  it("starts the next entry in a project from the last one saved", async () => {
    mockCreateEntry.mockResolvedValue({ id: "e1", durationMinutes: 45 });
    renderForm({ projectId: "p1", fields: RICH_FIELDS });

    const spinbuttons = screen.getAllByRole("spinbutton");
    setNativeValue(spinbuttons[0], "45");
    setNativeValue(spinbuttons[1], "5");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(mockCreateEntry).toHaveBeenCalledTimes(1));

    // The form reset itself from the entry just saved — save again untouched.
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(mockCreateEntry).toHaveBeenCalledTimes(2));

    expect(mockCreateEntry).toHaveBeenLastCalledWith("p1", expect.objectContaining({
      durationMinutes: 45,
      values: expect.objectContaining({ "f-hours": 5 }),
    }));
  });

  it("carries nothing over for a field whose type changed since the last entry", async () => {
    mockCreateEntry.mockResolvedValue({ id: "e1", durationMinutes: 45 });
    const { unmount } = renderForm({ projectId: "p1", fields: RICH_FIELDS });
    const spinbuttons = screen.getAllByRole("spinbutton");
    setNativeValue(spinbuttons[1], "5");
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(mockCreateEntry).toHaveBeenCalledTimes(1));
    unmount();

    // Same project, but Hours has since become a TEXT field. The remembered
    // number must not be offered to it (quickCapture keys values by type),
    // so the new entry starts with the plain empty TEXT default.
    renderForm({
      projectId: "p1",
      fields: [
        { id: "f-hours", name: "Hours", type: "TEXT", required: false, formula: null } as EntryField,
      ],
    });
    expect(await screen.findByText("Hours")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(mockCreateEntry).toHaveBeenCalledTimes(2));
    const payload = mockCreateEntry.mock.calls[1][1] as { values: Record<string, unknown> };
    expect(payload.values["f-hours"]).toBe("");
  });
});
