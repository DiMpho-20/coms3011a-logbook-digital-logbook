import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../api", () => ({
  fetchAutomationRules: vi.fn(),
  createAutomationRule: vi.fn(),
  updateAutomationRule: vi.fn(),
  deleteAutomationRule: vi.fn(),
  fetchEntryFields: vi.fn(),
  fetchTags: vi.fn(),
}));

import * as api from "../../api";
import AutomationRules from "../AutomationRules";

const HOURS = "11111111-1111-1111-1111-111111111111";
const NOTES = "22222222-2222-2222-2222-222222222222";
const WHEN = "33333333-3333-3333-3333-333333333333";
const TAG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const fields = [
  { id: HOURS, name: "Hours", type: "NUMBER", required: false },
  { id: NOTES, name: "Notes", type: "TEXT", required: false },
  // A DATE field: rules cannot compare it, so it must not be offered.
  { id: WHEN, name: "Happened On", type: "DATE", required: false },
];

const tags = [{ id: TAG, name: "long-session" }];

const rule = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  projectId: "p1",
  name: "Tag long sessions",
  trigger: "ENTRY_CREATED",
  conditions: [{ source: "FIELD", fieldId: HOURS, operator: "GT", value: 4 }],
  action: { type: "ADD_TAG", tagId: TAG },
  enabled: true,
  invalidReason: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const setup = async (rules: unknown[] = []) => {
  vi.mocked(api.fetchAutomationRules).mockResolvedValue(rules as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue(fields as never);
  vi.mocked(api.fetchTags).mockResolvedValue(tags as never);
  render(<AutomationRules projectId="p1" />);
  await screen.findByText("Automation Rules");
};

/** Open the builder and wait for the project's fields to be in the dropdown. */
const openForm = async () => {
  fireEvent.click(screen.getByRole("button", { name: "New Rule" }));
  await screen.findByLabelText("Name");
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AutomationRules — listing", () => {
  it("renders the section", async () => {
    await setup();
    expect(screen.getByText("Automation Rules")).toBeInTheDocument();
  });

  it("says so when there are no rules yet", async () => {
    await setup();
    expect(await screen.findByText(/No rules yet/i)).toBeInTheDocument();
  });

  it("shows a rule as a sentence rather than as ids", async () => {
    await setup([rule()]);

    expect(await screen.findByText("Tag long sessions")).toBeInTheDocument();
    expect(screen.getByText("When: Entry is created")).toBeInTheDocument();
    expect(screen.getByText("Hours is greater than 4")).toBeInTheDocument();
    expect(screen.getByText('Add the tag "long-session"')).toBeInTheDocument();
  });

  it("joins multiple conditions with and", async () => {
    await setup([
      rule({
        conditions: [
          { source: "ATTRIBUTE", attribute: "durationMinutes", operator: "GTE", value: 240 },
          { source: "FIELD", fieldId: NOTES, operator: "IS_NOT_EMPTY" },
        ],
      }),
    ]);

    expect(
      await screen.findByText("Duration (minutes) is at least 240 and Notes is not empty")
    ).toBeInTheDocument();
  });

  it("marks a disabled rule", async () => {
    await setup([rule({ enabled: false })]);
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });

  it("explains a rule that cannot run", async () => {
    await setup([rule({ invalidReason: "A field this rule uses is no longer available." })]);
    expect(await screen.findByText(/not running: A field this rule uses/i)).toBeInTheDocument();
  });

  it("shows an error when the rules cannot be loaded", async () => {
    vi.mocked(api.fetchAutomationRules).mockRejectedValue({
      response: { data: { error: "Project not found" } },
    });
    vi.mocked(api.fetchEntryFields).mockResolvedValue(fields as never);
    vi.mocked(api.fetchTags).mockResolvedValue(tags as never);
    render(<AutomationRules projectId="p1" />);

    expect(await screen.findByText("Project not found")).toBeInTheDocument();
  });
});

describe("AutomationRules — the builder", () => {
  it("opens a form for a new rule", async () => {
    await setup();
    await openForm();

    expect(screen.getByLabelText("When")).toBeInTheDocument();
    expect(screen.getByLabelText("Then")).toBeInTheDocument();
  });

  it("offers the project's comparable fields and leaves out the ones rules cannot compare", async () => {
    await setup();
    await openForm();

    const subject = screen.getByLabelText("Condition 1 subject") as HTMLSelectElement;
    const labels = Array.from(subject.options).map((option) => option.textContent);

    expect(labels).toContain("Duration (minutes)");
    expect(labels).toContain("Status");
    expect(labels).toContain("Hours");
    expect(labels).toContain("Notes");
    // A DATE field has no defined comparison, so it is not offered at all.
    expect(labels).not.toContain("Happened On");
  });

  it("offers only the operators the chosen subject admits", async () => {
    await setup();
    await openForm();

    const subject = screen.getByLabelText("Condition 1 subject");
    const operators = () =>
      Array.from((screen.getByLabelText("Condition 1 operator") as HTMLSelectElement).options).map(
        (option) => option.textContent
      );

    fireEvent.change(subject, { target: { value: HOURS } });
    expect(operators()).toContain("is greater than");

    fireEvent.change(subject, { target: { value: NOTES } });
    // Text cannot be ordered — this is the "notes > 5" case, refused in the UI
    // as well as on the server.
    expect(operators()).not.toContain("is greater than");
    expect(operators()).toContain("is");
  });

  it("drops the value box for an operator that takes none", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Condition 1 subject"), { target: { value: NOTES } });
    expect(screen.getByLabelText("Condition 1 value")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Condition 1 operator"), { target: { value: "IS_EMPTY" } });
    expect(screen.queryByLabelText("Condition 1 value")).not.toBeInTheDocument();
  });

  it("offers Open and Done rather than free text for a status condition", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Condition 1 subject"), { target: { value: "status" } });
    const value = screen.getByLabelText("Condition 1 value") as HTMLSelectElement;

    expect(Array.from(value.options).map((option) => option.value)).toEqual(["OPEN", "DONE"]);
  });

  it("creates a rule from the dropdowns alone", async () => {
    await setup();
    vi.mocked(api.createAutomationRule).mockResolvedValue(rule() as never);
    await openForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Tag long sessions" } });
    fireEvent.change(screen.getByLabelText("Condition 1 subject"), { target: { value: HOURS } });
    fireEvent.change(screen.getByLabelText("Condition 1 operator"), { target: { value: "GT" } });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Action tag"), { target: { value: TAG } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(api.createAutomationRule).toHaveBeenCalled());
    expect(api.createAutomationRule).toHaveBeenCalledWith("p1", {
      name: "Tag long sessions",
      trigger: "ENTRY_CREATED",
      // The number is sent as a number, not the string the input held.
      conditions: [{ source: "FIELD", fieldId: HOURS, operator: "GT", value: 4 }],
      action: { type: "ADD_TAG", tagId: TAG },
    });
  });

  it("adds a second condition", async () => {
    await setup();
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(screen.getByLabelText("Condition 2 subject")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove condition 2" }));
    expect(screen.queryByLabelText("Condition 2 subject")).not.toBeInTheDocument();
  });

  it("refuses to save without a name, without calling the API", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
    expect(api.createAutomationRule).not.toHaveBeenCalled();
  });

  it("refuses to save a condition with no value", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Nameless value" } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/value/i);
    expect(api.createAutomationRule).not.toHaveBeenCalled();
  });

  it("refuses a tag action with no tag chosen", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "No tag" } });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/tag/i);
    expect(api.createAutomationRule).not.toHaveBeenCalled();
  });

  it("shows the server's rejection when it refuses the rule", async () => {
    await setup();
    vi.mocked(api.createAutomationRule).mockRejectedValue({
      response: { data: { error: '"Notes" must be compared with text.' } },
    });
    await openForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad rule" } });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Action tag"), { target: { value: TAG } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/compared with text/i);
  });

  it("swaps the tag dropdown for a status dropdown when the action changes", async () => {
    await setup();
    await openForm();

    fireEvent.change(screen.getByLabelText("Then"), { target: { value: "SET_STATUS" } });

    expect(screen.getByLabelText("Action status")).toBeInTheDocument();
    expect(screen.queryByLabelText("Action tag")).not.toBeInTheDocument();
  });
});

describe("AutomationRules — editing an existing rule", () => {
  it("opens the form already filled in", async () => {
    await setup([rule()]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tag long sessions" }));

    expect(await screen.findByLabelText("Name")).toHaveValue("Tag long sessions");
    expect(screen.getByLabelText("Condition 1 subject")).toHaveValue(HOURS);
    expect(screen.getByLabelText("Condition 1 operator")).toHaveValue("GT");
    expect(screen.getByLabelText("Condition 1 value")).toHaveValue("4");
  });

  it("saves the change", async () => {
    await setup([rule()]);
    vi.mocked(api.updateAutomationRule).mockResolvedValue(rule() as never);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Tag long sessions" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateAutomationRule).toHaveBeenCalled());
    expect(vi.mocked(api.updateAutomationRule).mock.calls[0][2]).toMatchObject({ name: "Renamed" });
  });

  it("disables a rule without deleting it", async () => {
    await setup([rule()]);
    vi.mocked(api.updateAutomationRule).mockResolvedValue(rule({ enabled: false }) as never);

    fireEvent.click(await screen.findByRole("button", { name: "Disable" }));

    await waitFor(() => expect(api.updateAutomationRule).toHaveBeenCalledWith("p1", "r1", { enabled: false }));
    expect(api.deleteAutomationRule).not.toHaveBeenCalled();
  });

  it("re-enables a disabled rule", async () => {
    await setup([rule({ enabled: false })]);
    vi.mocked(api.updateAutomationRule).mockResolvedValue(rule() as never);

    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() => expect(api.updateAutomationRule).toHaveBeenCalledWith("p1", "r1", { enabled: true }));
  });

  it("asks before deleting, then deletes", async () => {
    await setup([rule()]);
    vi.mocked(api.deleteAutomationRule).mockResolvedValue(undefined as never);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Tag long sessions" }));
    expect(await screen.findByText(/Delete “Tag long sessions”/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete rule" }));
    await waitFor(() => expect(api.deleteAutomationRule).toHaveBeenCalledWith("p1", "r1"));
  });

  it("does not delete when the confirmation is dismissed", async () => {
    await setup([rule()]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Tag long sessions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(api.deleteAutomationRule).not.toHaveBeenCalled();
  });
});
