import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EntryForm from "../../components/EntryForm";
import type { Project, EntryField } from "../../api";

// Mock the API module — createEntry is the only function EntryForm calls
const mockCreateEntry = vi.fn();
vi.mock("../../api", () => ({
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
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
