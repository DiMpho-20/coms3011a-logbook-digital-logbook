import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  fetchEntryFields: vi.fn(),
  fetchAllProjectTimeSummaries: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import * as api from "../../api";
import { api as client } from "../../api/client";
import StatsPage from "../StatsPage";

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  userId: "u1",
  name: "Campus Marketplace",
  description: null,
  status: "ACTIVE",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const field = (over: Record<string, unknown> = {}) => ({
  id: "f-hours",
  projectId: "p1",
  name: "Hours",
  type: "NUMBER",
  required: false,
  formula: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const HOURS = field();
const DUE = field({ id: "f-due", name: "Due", type: "DATE" });
const CATEGORY = field({ id: "f-cat", name: "Category", type: "TEXT" });

const summary = (totalMinutes: number) => ({
  projectId: "p1",
  totalMinutes,
  totalHours: Math.round((totalMinutes / 60) * 10) / 10,
  entryCount: 1,
  lastEntryAt: null,
});

/**
 * Both panels post to the same client, so a single blanket mock would feed
 * timeline points to the group panel (and crash on `groups.length`). Route
 * by URL instead, the way the real server does.
 */
const postRouter = (
  group: unknown = { groups: [{ key: "total", value: 320 }] },
  timeline: unknown = { points: [{ date: "2026-09-07", value: 3 }] },
  expression: unknown = { value: 3.42 }
) =>
  ((url: string) =>
    Promise.resolve({
      data: url.endsWith("/timeline") ? timeline : url.endsWith("/expression") ? expression : group,
    })) as never;

const renderStats = () =>
  render(
    <MemoryRouter initialEntries={["/stats"]}>
      <StatsPage />
    </MemoryRouter>
  );

const renderAndWait = async () => {
  renderStats();
  await screen.findByRole("heading", { name: "Statistics" });
};

const withFields = async (fields: unknown[] = [HOURS, DUE, CATEGORY]) => {
  vi.mocked(api.fetchEntryFields).mockResolvedValue(fields as never);
  await renderAndWait();
};

/**
 * The three panels reuse the same control labels and placeholder copy
 * ("Loading fields…", "Computing…"), so queries are scoped to one panel
 * rather than run against the whole page.
 */
const sectionFor = (name: RegExp) =>
  screen.getByRole("heading", { name }).closest("section") as HTMLElement;

const TIME = /Time per project/;
const GROUP = /Total & Group/;
const TIMELINE = /Over Time/;

/** The select in `scope` that offers `value` — none of them have a label. */
const selectOffering = (scope: HTMLElement, value: string) =>
  within(scope)
    .getAllByRole("combobox")
    .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === value))!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchProjects).mockResolvedValue([project()] as never);
  vi.mocked(api.fetchAllProjectTimeSummaries).mockResolvedValue([summary(0)] as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue([] as never);
  vi.mocked(client.post).mockImplementation(postRouter());
  // Every render asks for the saved statistics (US17); most tests have none.
  vi.mocked(client.get).mockResolvedValue({ data: [] } as never);
  vi.mocked(client.patch).mockResolvedValue({ data: {} } as never);
  vi.mocked(client.delete).mockResolvedValue({ data: {} } as never);
});

describe("StatsPage — loading and empty states", () => {
  it("waits on the projects before drawing anything", () => {
    vi.mocked(api.fetchProjects).mockReturnValue(new Promise(() => {}) as never);
    renderStats();

    expect(screen.getByText("Loading projects…")).toBeInTheDocument();
  });

  it("says so when there are no projects at all", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderStats();

    expect(
      await screen.findByText("No projects yet. Create one to see stats.")
    ).toBeInTheDocument();
  });

  it("clears the spinner when the projects request fails", async () => {
    vi.mocked(api.fetchProjects).mockRejectedValue(new Error("offline"));
    renderStats();

    // The catch path must stop loading, or the page hangs on the spinner.
    expect(
      await screen.findByText("No projects yet. Create one to see stats.")
    ).toBeInTheDocument();
  });

  it("selects the first project without being asked", async () => {
    await renderAndWait();

    await waitFor(() => expect(api.fetchEntryFields).toHaveBeenCalledWith("p1"));
  });

  it("shows a placeholder in both panels while the fields load", async () => {
    vi.mocked(api.fetchEntryFields).mockReturnValue(new Promise(() => {}) as never);
    await renderAndWait();
    // renderAndWait only gets as far as the heading, which commits on the
    // urgent render. Picking the first project is a router transition that
    // commits after it, so waiting on the fields request is what proves the
    // selection landed and these panels are genuinely mid-load rather than
    // still showing their no-fields empty state.
    await waitFor(() => expect(api.fetchEntryFields).toHaveBeenCalledWith("p1"));

    expect(within(sectionFor(GROUP)).getByText("Loading fields…")).toBeInTheDocument();
    expect(within(sectionFor(TIMELINE)).getByText("Loading fields…")).toBeInTheDocument();
  });

  it("empties the field list when the fields request fails", async () => {
    vi.mocked(api.fetchEntryFields).mockRejectedValue(new Error("nope"));
    await renderAndWait();

    expect(
      await screen.findByText("This project has no entry fields yet — add one to see it here.")
    ).toBeInTheDocument();
  });
});

describe("StatsPage — time per project", () => {
  it("draws a bar per active project, longest first", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Digital Logbook" }),
      project({ id: "p3", name: "Retired thing", status: "ARCHIVED" }),
    ] as never);
    vi.mocked(api.fetchAllProjectTimeSummaries).mockResolvedValue([
      summary(150),
      { ...summary(45), projectId: "p2" },
    ] as never);
    await renderAndWait();

    const time = sectionFor(TIME);
    await within(time).findByRole("img", { name: "Campus Marketplace: 2h 30m" });
    // Queried off the DOM rather than by role, so the order asserted here is
    // the order the bars are painted in.
    expect(
      Array.from(time.querySelectorAll('[role="img"]')).map((bar) =>
        bar.getAttribute("aria-label")
      )
    ).toEqual(["Campus Marketplace: 2h 30m", "Digital Logbook: 45m"]);
    // One batch request covers the whole logbook; the archived project comes
    // back in it but is not drawn.
    expect(api.fetchAllProjectTimeSummaries).toHaveBeenCalledTimes(1);
  });

  it("reads the whole chart as zero when the batch request fails", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Digital Logbook" }),
    ] as never);
    vi.mocked(api.fetchAllProjectTimeSummaries).mockRejectedValue(new Error("boom"));
    await renderAndWait();

    expect(
      await within(sectionFor(TIME)).findByText(
        "No time logged yet — entries you add will show up here."
      )
    ).toBeInTheDocument();
  });

  it("shows a spinner until the batch of per-project times arrives", async () => {
    vi.mocked(api.fetchAllProjectTimeSummaries).mockReturnValue(new Promise(() => {}) as never);
    await renderAndWait();

    expect(within(sectionFor(TIME)).getByText("Loading…")).toBeInTheDocument();
  });

  it("says nothing is logged yet when every project is at zero", async () => {
    await renderAndWait();

    expect(
      await screen.findByText("No time logged yet — entries you add will show up here.")
    ).toBeInTheDocument();
  });
});

describe("StatsPage — total and group", () => {
  it("totals the first numeric field as soon as the fields land", async () => {
    await withFields();

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/projects/p1/stats/group", {
        metricFieldId: "f-hours",
        operation: "sum",
      })
    );
    expect(await screen.findByText("320")).toBeInTheDocument();
    expect(screen.getByText("sum of Hours")).toBeInTheDocument();
  });

  it("shows a fractional result to one decimal place", async () => {
    vi.mocked(client.post).mockImplementation(
      postRouter({ groups: [{ key: "total", value: 42.456 }] })
    );
    await withFields();

    expect(await screen.findByText("42.5")).toBeInTheDocument();
  });

  it("groups by another field once one is picked", async () => {
    await withFields();
    await screen.findByText("320");

    vi.mocked(client.post).mockImplementation(
      postRouter({
        groups: [
          { key: "Research", value: 120 },
          { key: "Writing", value: 60 },
        ],
      })
    );
    const group = sectionFor(GROUP);
    // Not selectOffering: the Field select now also offers every field
    // (including "f-cat"), so picking by option value would be ambiguous.
    // The three selects are always Field, Operation, Group by in that order.
    const groupBySelect = within(group).getAllByRole("combobox")[2];
    fireEvent.change(groupBySelect, { target: { value: "f-cat" } });

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/stats/group", {
        metricFieldId: "f-hours",
        operation: "sum",
        groupByFieldId: "f-cat",
      })
    );
    expect(await within(group).findByRole("img", { name: "Research: 120" })).toBeInTheDocument();
    expect(within(group).getByRole("img", { name: "Writing: 60" })).toBeInTheDocument();
  });

  it("recomputes when the operation changes", async () => {
    await withFields();
    await screen.findByText("320");

    fireEvent.change(selectOffering(sectionFor(GROUP), "avg"), { target: { value: "avg" } });

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/stats/group", {
        metricFieldId: "f-hours",
        operation: "avg",
      })
    );
    expect(await screen.findByText("avg of Hours")).toBeInTheDocument();
  });

  it("shows a spinner in each panel while a request is in flight", async () => {
    vi.mocked(client.post).mockImplementation((() => new Promise(() => {})) as never);
    await withFields();

    expect(await within(sectionFor(GROUP)).findByText("Computing…")).toBeInTheDocument();
    expect(within(sectionFor(TIMELINE)).getByText("Computing…")).toBeInTheDocument();
  });

  it("surfaces the server's own error message", async () => {
    vi.mocked(client.post).mockRejectedValue({
      response: { data: { error: "Field is not numeric" } },
    });
    await withFields();

    // Both panels fail here, so the assertion is scoped to this one.
    expect(
      await within(sectionFor(GROUP)).findByText("Field is not numeric")
    ).toBeInTheDocument();
  });

  it("falls back to its own message when the server gives none", async () => {
    vi.mocked(client.post).mockRejectedValue(new Error("network"));
    await withFields();

    expect(
      await within(sectionFor(GROUP)).findByText("Failed to compute stats")
    ).toBeInTheDocument();
    expect(
      within(sectionFor(TIMELINE)).getByText("Failed to compute timeline")
    ).toBeInTheDocument();
  });

  it("says when no entries have the field filled in", async () => {
    vi.mocked(client.post).mockImplementation(postRouter({ groups: [] }));
    await withFields();

    expect(
      await within(sectionFor(GROUP)).findByText("No entries have this field filled in yet.")
    ).toBeInTheDocument();
  });

  it("still lets a non-numeric field be counted, but nothing more", async () => {
    vi.mocked(client.post).mockImplementation(postRouter({ groups: [{ key: "total", value: 2 }] }));
    await withFields([CATEGORY]);

    // A field of any type can still be counted...
    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/projects/p1/stats/group", {
        metricFieldId: "f-cat",
        operation: "count",
      })
    );

    // ...but sum/avg/min/max aren't offered for it.
    const operationSelect = selectOffering(sectionFor(GROUP), "count") as HTMLSelectElement;
    expect(Array.from(operationSelect.options).map((o) => o.value)).toEqual(["count"]);
  });
});

describe("StatsPage — over time", () => {
  it("counts entries per week by default", async () => {
    await withFields();

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/projects/p1/stats/timeline", {
        dateFieldId: "f-due",
        bucket: "week",
      })
    );
    expect(
      screen.getByText("How many entries have a Due value, counted per week.")
    ).toBeInTheDocument();
  });

  it("switches to totalling a numeric field", async () => {
    await withFields();
    await screen.findByText("How many entries have a Due value, counted per week.");

    fireEvent.change(selectOffering(sectionFor(TIMELINE), "__count__"), {
      target: { value: "f-hours" },
    });

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/stats/timeline", {
        dateFieldId: "f-due",
        bucket: "week",
        operation: "sum",
        metricFieldId: "f-hours",
      })
    );
    expect(
      await screen.findByText(
        "Total Hours across entries, added up per week by each entry's Due."
      )
    ).toBeInTheDocument();
  });

  it("re-buckets when another bucket is picked", async () => {
    await withFields();
    await screen.findByText("How many entries have a Due value, counted per week.");

    fireEvent.click(within(sectionFor(TIMELINE)).getByRole("button", { name: "month" }));

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/stats/timeline", {
        dateFieldId: "f-due",
        bucket: "month",
      })
    );
    expect(
      await screen.findByText("How many entries have a Due value, counted per month.")
    ).toBeInTheDocument();
  });

  it("says when there are no dated entries", async () => {
    vi.mocked(client.post).mockImplementation(postRouter(undefined, { points: [] }));
    await withFields();

    expect(
      await within(sectionFor(TIMELINE)).findByText("No dated entries yet.")
    ).toBeInTheDocument();
  });

  it("plots by the entry's own date when the project has no date fields", async () => {
    await withFields([HOURS]);

    const section = sectionFor(TIMELINE);
    // No DATE field anywhere — the reserved entry-date option is offered,
    // preselected, and used by the timeline request.
    await waitFor(() =>
      expect(selectOffering(section, "ENTRY_DATE")).toHaveValue("ENTRY_DATE")
    );
    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith(
        "/projects/p1/stats/timeline",
        expect.objectContaining({ dateFieldId: "ENTRY_DATE" })
      )
    );
  });
});

describe("StatsPage — switching project", () => {
  it("loads the newly chosen project's fields", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Digital Logbook" }),
    ] as never);
    await withFields();
    await waitFor(() => expect(api.fetchEntryFields).toHaveBeenCalledWith("p1"));

    fireEvent.change(selectOffering(document.body, "p2"), { target: { value: "p2" } });

    await waitFor(() => expect(api.fetchEntryFields).toHaveBeenCalledWith("p2"));
  });
});

describe("StatsPage — custom expressions", () => {
  const EXPRESSION = /Custom Expression/;
  const typeExpression = (value: string) =>
    fireEvent.change(screen.getByLabelText("Expression"), { target: { value } });
  const calculate = () => fireEvent.click(screen.getByRole("button", { name: "Calculate" }));

  /**
   * The panel's form is drawn as soon as a project is chosen — briefly, with
   * no fields — then replaced by the loading placeholder until the fields
   * request lands. Waiting on the form itself would catch that empty state,
   * so wait for a field chip, which only exists once the request has landed.
   */
  const withExpressionPanel = async () => {
    await withFields();
    await screen.findByRole("heading", { name: EXPRESSION });
    await within(sectionFor(EXPRESSION)).findByRole("button", { name: "Hours" });
  };

  it("offers the fields and functions an expression can use", async () => {
    await withExpressionPanel();

    const panel = sectionFor(EXPRESSION);
    // Only the fields that can actually be aggregated are offered.
    expect(within(panel).getByRole("button", { name: "Hours" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Category" })).not.toBeInTheDocument();
    expect(within(panel).getByText("COUNT()")).toBeInTheDocument();
    expect(within(panel).getByText("SUM(field)")).toBeInTheDocument();
  });

  it("will not calculate until something has been written", async () => {
    await withExpressionPanel();

    expect(screen.getByRole("button", { name: "Calculate" })).toBeDisabled();
    typeExpression("COUNT()");
    expect(screen.getByRole("button", { name: "Calculate" })).toBeEnabled();
  });

  it("adds a field to the expression when its chip is clicked", async () => {
    await withExpressionPanel();

    fireEvent.click(within(sectionFor(EXPRESSION)).getByRole("button", { name: "Hours" }));

    // Braced, so a name with spaces stays one token.
    expect(screen.getByLabelText("Expression")).toHaveValue("{Hours}");
  });

  it("sends the expression to the project it is scoped to, and shows the result", async () => {
    await withExpressionPanel();

    typeExpression("  SUM({Hours}) / COUNT()  ");
    calculate();

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/stats/expression", {
        expression: "SUM({Hours}) / COUNT()",
      })
    );
    expect(await within(sectionFor(EXPRESSION)).findByText("3.4")).toBeInTheDocument();
  });

  it("shows the server's complaint rather than a generic failure", async () => {
    await withExpressionPanel();
    vi.mocked(client.post).mockRejectedValue({
      response: { data: { error: 'This project has no field called "Nope".' } },
    });

    typeExpression("SUM({Nope})");
    calculate();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no field called "Nope"/i);
  });

  it("falls back to its own message when the server cannot be reached", async () => {
    await withExpressionPanel();
    vi.mocked(client.post).mockRejectedValue(new Error("offline"));

    typeExpression("COUNT()");
    calculate();

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not work that expression out/i);
  });

  it("shows a spinner while the server is working it out", async () => {
    await withExpressionPanel();
    vi.mocked(client.post).mockImplementation((() => new Promise(() => {})) as never);

    typeExpression("COUNT()");
    calculate();

    expect(await within(sectionFor(EXPRESSION)).findByText("Calculating…")).toBeInTheDocument();
  });
});

describe("StatsPage — saved statistics", () => {
  const SAVED = /My Custom Statistics/;
  const statistic = (over: Record<string, unknown> = {}) => ({
    id: "s1",
    projectId: "p1",
    name: "Average Hours Per Entry",
    expression: "SUM({Hours}) / COUNT()",
    value: 3.42,
    error: null,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    ...over,
  });

  // "Expression" labels both the panel's own box and the dialog's, so the
  // dialog's fields are always reached through the dialog.
  const dialog = () => screen.getByLabelText("Name").closest("form") as HTMLElement;
  const typeIn = (field: HTMLElement, value: string) =>
    fireEvent.change(field, { target: { value } });
  const press = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

  const calculate = async () => {
    // The panel draws its form without fields before the fields request
    // lands; wait for a field chip so the queries below cannot catch it
    // mid-swap, the same way withExpressionPanel does.
    await within(sectionFor(/Custom Expression/)).findByRole("button", { name: "Hours" });
    fireEvent.change(screen.getByLabelText("Expression"), {
      target: { value: "SUM({Hours}) / COUNT()" },
    });
    press("Calculate");
    return screen.findByRole("button", { name: "Save as statistic" });
  };

  it("says nothing is saved yet for a project with none", async () => {
    await withFields();

    expect(await within(sectionFor(SAVED)).findByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it("lists a saved statistic with its value and the expression behind it", async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [statistic()] } as never);
    await withFields();

    const panel = sectionFor(SAVED);
    expect(await within(panel).findByText("Average Hours Per Entry")).toBeInTheDocument();
    expect(within(panel).getByText("3.4")).toBeInTheDocument();
    expect(within(panel).getByText("SUM({Hours}) / COUNT()")).toBeInTheDocument();
  });

  it("says why a saved statistic has stopped working, without hiding it", async () => {
    vi.mocked(client.get).mockResolvedValue({
      data: [statistic({ value: null, error: 'This project has no field called "Hours".' })],
    } as never);
    await withFields();

    const panel = sectionFor(SAVED);
    expect(await within(panel).findByText(/no field called "Hours"/)).toBeInTheDocument();
    // Still listed, so it can be edited rather than silently lost.
    expect(within(panel).getByText("Average Hours Per Entry")).toBeInTheDocument();
  });

  it("offers to save only once an expression has produced a result", async () => {
    await withFields();

    expect(screen.queryByRole("button", { name: "Save as statistic" })).not.toBeInTheDocument();
    await calculate();
    expect(screen.getByRole("button", { name: "Save as statistic" })).toBeInTheDocument();
  });

  it("opens the dialog with the expression already filled in", async () => {
    await withFields();
    await calculate();

    press("Save as statistic");

    expect(within(dialog()).getByLabelText("Expression")).toHaveValue("SUM({Hours}) / COUNT()");
    expect(screen.getByLabelText("Name")).toHaveValue("");
    // Nothing to save until it is named.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the named statistic against this project", async () => {
    await withFields();
    await calculate();
    press("Save as statistic");

    typeIn(screen.getByLabelText("Name"), "  Average Hours Per Entry  ");
    press("Save");

    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith("/projects/p1/custom-statistics", {
        name: "Average Hours Per Entry",
        expression: "SUM({Hours}) / COUNT()",
      })
    );
  });

  it("shows the server's reason for refusing a statistic", async () => {
    await withFields();
    await calculate();
    press("Save as statistic");
    typeIn(screen.getByLabelText("Name"), "Broken");
    vi.mocked(client.post).mockRejectedValue({
      response: { data: { error: "You already have a statistic with that name in this project" } },
    });

    press("Save");

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(/already have a statistic/i);
  });

  it("opens the edit dialog filled with what was saved", async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [statistic()] } as never);
    await withFields();
    await within(sectionFor(SAVED)).findByText("Average Hours Per Entry");

    press("Edit Average Hours Per Entry");

    expect(screen.getByLabelText("Name")).toHaveValue("Average Hours Per Entry");
    expect(within(dialog()).getByLabelText("Expression")).toHaveValue("SUM({Hours}) / COUNT()");
  });

  it("sends an edit as a change to the one that was saved", async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [statistic()] } as never);
    await withFields();
    await within(sectionFor(SAVED)).findByText("Average Hours Per Entry");
    press("Edit Average Hours Per Entry");

    typeIn(within(dialog()).getByLabelText("Expression"), "MAX({Hours})");
    press("Save");

    await waitFor(() =>
      expect(client.patch).toHaveBeenLastCalledWith("/projects/p1/custom-statistics/s1", {
        name: "Average Hours Per Entry",
        expression: "MAX({Hours})",
      })
    );
  });

  it("asks before deleting, and names what it is about to remove", async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [statistic()] } as never);
    await withFields();
    await within(sectionFor(SAVED)).findByText("Average Hours Per Entry");

    press("Delete Average Hours Per Entry");

    expect(await screen.findByText(/Delete .Average Hours Per Entry/)).toBeInTheDocument();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("deletes once the confirmation is given", async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [statistic()] } as never);
    await withFields();
    await within(sectionFor(SAVED)).findByText("Average Hours Per Entry");
    press("Delete Average Hours Per Entry");

    press("Delete");

    await waitFor(() =>
      expect(client.delete).toHaveBeenCalledWith("/projects/p1/custom-statistics/s1")
    );
  });

  it("explains itself when the saved list cannot be loaded", async () => {
    vi.mocked(client.get).mockRejectedValue(new Error("offline"));
    await withFields();

    expect(
      await within(sectionFor(SAVED)).findByText(/Could not load your saved statistics/)
    ).toBeInTheDocument();
  });
});
