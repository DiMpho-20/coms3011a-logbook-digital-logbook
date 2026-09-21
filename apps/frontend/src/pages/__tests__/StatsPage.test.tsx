import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  fetchEntryFields: vi.fn(),
  fetchProjectTimeSummary: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: { post: vi.fn() },
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
  timeline: unknown = { points: [{ date: "2026-09-07", value: 3 }] }
) =>
  ((url: string) =>
    Promise.resolve({ data: url.endsWith("/timeline") ? timeline : group })) as never;

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
  vi.mocked(api.fetchProjectTimeSummary).mockResolvedValue(summary(0) as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue([] as never);
  vi.mocked(client.post).mockImplementation(postRouter());
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
      await screen.findByText(
        "This project has no Number or Computed fields to total yet — add one to a field to see it here."
      )
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
    vi.mocked(api.fetchProjectTimeSummary).mockImplementation(
      ((id: string) => Promise.resolve(summary(id === "p1" ? 150 : 45))) as never
    );
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
    // An archived project is not even asked about.
    expect(api.fetchProjectTimeSummary).not.toHaveBeenCalledWith("p3");
  });

  it("counts a project whose summary fails as zero", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      project(),
      project({ id: "p2", name: "Digital Logbook" }),
    ] as never);
    vi.mocked(api.fetchProjectTimeSummary).mockImplementation(
      ((id: string) =>
        id === "p1" ? Promise.reject(new Error("boom")) : Promise.resolve(summary(45))) as never
    );
    await renderAndWait();

    const time = sectionFor(TIME);
    await within(time).findByRole("img", { name: "Digital Logbook: 45m" });
    // One failed request does not sink the whole chart — it just reads zero,
    // and zero-length bars are left out.
    expect(
      within(time).queryByRole("img", { name: /Campus Marketplace/ })
    ).not.toBeInTheDocument();
  });

  it("shows a spinner until the per-project times arrive", async () => {
    vi.mocked(api.fetchProjectTimeSummary).mockReturnValue(new Promise(() => {}) as never);
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
    fireEvent.change(selectOffering(group, "f-cat"), { target: { value: "f-cat" } });

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

  it("says when the project has nothing numeric to total", async () => {
    await withFields([CATEGORY]);

    expect(
      await screen.findByText(
        "This project has no Number or Computed fields to total yet — add one to a field to see it here."
      )
    ).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
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

  it("says when the project has no date fields", async () => {
    await withFields([HOURS]);

    expect(
      await screen.findByText(
        "This project has no Date fields, so there's nothing to place on a timeline yet."
      )
    ).toBeInTheDocument();
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
