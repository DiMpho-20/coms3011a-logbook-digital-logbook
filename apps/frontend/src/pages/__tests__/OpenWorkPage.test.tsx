import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));

import { api } from "../../api/client";
import { ToastProvider } from "../../components/Toast";
import OpenWorkPage from "../OpenWorkPage";

// ── Fixtures ─────────────────────────────────────────────────────────────
// Bucketing is relative to "now", so every due date here is built from today
// rather than written as a literal — otherwise the suite would start failing
// on whatever date the literals drifted past.

const at = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
};

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  projectId: "p1",
  durationMinutes: 30,
  entryDate: null,
  dueDate: null,
  values: { "f-sum": "Write the report" },
  status: "OPEN",
  completedAt: null,
  tags: [],
  format: null,
  archivedAt: null,
  createdAt: at(-10),
  updatedAt: at(-10),
  ...over,
});

const PROJECTS = [
  { id: "p1", name: "Campus Marketplace" },
  { id: "p2", name: "Digital Logbook" },
];

/**
 * Answers the page's one GET, /me/open-entries: every open entry across the
 * owner's projects, each carrying its project's name, as the endpoint returns
 * them. Fixtures are grouped by project id for readability.
 */
const serve = (byProject: Record<string, unknown[]>, projects = PROJECTS) =>
  ((url: string) => {
    if (url !== "/me/open-entries") return Promise.resolve({ data: [] });
    const all = Object.entries(byProject).flatMap(([id, list]) =>
      list.map((e) => ({ ...(e as object), projectName: projects.find((p) => p.id === id)?.name }))
    );
    return Promise.resolve({ data: all });
  }) as never;

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <OpenWorkPage />
      </ToastProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(serve({}));
  vi.mocked(api.patch).mockResolvedValue({ data: {} } as never);
  vi.mocked(api.put).mockImplementation(((url: string, body: { dueDate: string }) =>
    Promise.resolve({ data: { id: url.split("/").pop(), dueDate: `${body.dueDate}T00:00:00.000Z` } })) as never);
});

const markDoneButtons = () => screen.queryAllByRole("button", { name: /mark done/i });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenWorkPage — loading and failure", () => {
  it("says it is loading before anything arrives", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never);
    renderPage();

    expect(screen.getByText("Loading open work…")).toBeInTheDocument();
  });

  it("shows the server's reason when the load fails", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: "Session expired" } } });
    renderPage();

    expect(await screen.findByText("Session expired")).toBeInTheDocument();
  });

  it("falls back to its own message when the server gives none", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(await screen.findByText("Failed to load open work")).toBeInTheDocument();
  });

  it("says calmly when there is no open work, and points to Entries", async () => {
    renderPage();

    expect(await screen.findByText("No open work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View entries" })).toHaveAttribute("href", "/entries");
    // No sections, no summary counts, with nothing to count.
    expect(screen.queryByRole("navigation", { name: "Open work summary" })).toBeNull();
  });
});

describe("OpenWorkPage — gathering the work", () => {
  it("asks for every project's open entries in one request", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    renderPage();

    await screen.findByText("Write the report");
    // One request however many projects there are, not one per project.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/me/open-entries");
  });

  it("gathers entries from every project into one list", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry()], p2: [entry({ id: "e2", projectId: "p2" })] })
    );
    renderPage();

    await waitFor(() => expect(markDoneButtons()).toHaveLength(2));
    expect(screen.getByRole("link", { name: "Campus Marketplace" })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByRole("link", { name: "Digital Logbook" })).toHaveAttribute("href", "/projects/p2");
  });
});

describe("OpenWorkPage — sorting work into buckets", () => {
  const spread = () =>
    serve({
      p1: [
        entry({ id: "late", dueDate: at(-2) }),
        entry({ id: "now", dueDate: at(0) }),
        entry({ id: "later", dueDate: at(3) }),
        entry({ id: "someday", dueDate: null }),
      ],
    });

  it("puts each entry in the section its due date earns", async () => {
    vi.mocked(api.get).mockImplementation(spread());
    renderPage();

    // The count travels with the heading, so a miscounted section fails here.
    const overdue = await screen.findByRole("region", { name: "Overdue · 1" });
    expect(within(overdue).getByText(/2 days ago/)).toBeInTheDocument();
    const comingUp = screen.getByRole("region", { name: "Coming up" });
    expect(within(comingUp).getByText("Today")).toBeInTheDocument();
    expect(within(comingUp).getAllByRole("button", { name: /mark done/i })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "No date yet · 1" })).toBeInTheDocument();

    const summary = screen.getByRole("navigation", { name: "Open work summary" });
    expect(within(summary).getByRole("link", { name: /1\s*Overdue/ })).toHaveAttribute("href", "#overdue");
    expect(within(summary).getByRole("link", { name: /2\s*Due this week/ })).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: /1\s*No date/ })).toBeInTheDocument();
  });

  it("leaves out the overdue section when nothing is late", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(5) })] }));
    renderPage();

    await screen.findByRole("region", { name: "Coming up" });
    expect(screen.queryByRole("region", { name: /^Overdue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^No date yet/ })).not.toBeInTheDocument();
  });

  it("counts several overdue entries together", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ id: "a", dueDate: at(-1) }), entry({ id: "b", dueDate: at(-4) })] })
    );
    renderPage();

    expect(await screen.findByRole("region", { name: "Overdue · 2" })).toBeInTheDocument();
  });

  it("says nothing is scheduled when all the open work is undated", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: null })] }));
    renderPage();

    const comingUp = await screen.findByRole("region", { name: "Coming up" });
    expect(within(comingUp).getByText("Nothing scheduled yet")).toBeInTheDocument();
    expect(within(comingUp).getByText("Your undated work is below.")).toBeInTheDocument();
  });

  it("lists work due beyond two weeks under Later rather than hiding it", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(30) })] }));
    renderPage();

    const comingUp = await screen.findByRole("region", { name: "Coming up" });
    expect(within(comingUp).getByText("Later")).toBeInTheDocument();
    expect(within(comingUp).getByText("Write the report")).toBeInTheDocument();
  });
});

describe("OpenWorkPage — the calendar link", () => {
  // The link is form-encoded, where a space travels as "+" — which
  // decodeURIComponent leaves alone. Read the title back through
  // URLSearchParams, the same way the page wrote it.
  const calendarTitle = (href: string) => new URL(href).searchParams.get("text") ?? "";

  it("offers to add a dated entry to Google Calendar", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(2) })] }));
    renderPage();

    const link = await screen.findByRole("link", { name: "Add to Google Calendar" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("https://calendar.google.com/calendar/render?");
    // The title carries the project and the entry's own summary text.
    expect(calendarTitle(href)).toContain("Campus Marketplace — Write the report");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers nothing to add when the entry has no due date", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: null })] }));
    renderPage();

    await screen.findByText("Write the report");
    expect(screen.queryByRole("link", { name: "Add to Google Calendar" })).not.toBeInTheDocument();
  });

  it("names the entry by its id when it has no text to summarise", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ id: "bare", dueDate: at(1), values: {} })] })
    );
    renderPage();

    const link = await screen.findByRole("link", { name: "Add to Google Calendar" });
    expect(calendarTitle(link.getAttribute("href") ?? "")).toContain("Logbook entry bare");
  });
});

describe("OpenWorkPage — marking work done", () => {
  it("marks an entry done and takes it off the list", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ id: "e1" }), entry({ id: "e2" })] })
    );
    renderPage();

    await waitFor(() => expect(markDoneButtons()).toHaveLength(2));
    fireEvent.click(markDoneButtons()[0]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/entries/e1/status", { status: "DONE" })
    );
    await waitFor(() => expect(markDoneButtons()).toHaveLength(1));
  });

  it("leaves the entry in place when the server refuses", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    vi.mocked(api.patch).mockRejectedValue(new Error("nope"));
    renderPage();

    await screen.findByText("Write the report");
    fireEvent.click(screen.getByRole("button", { name: /mark done/i }));

    // The failure is a quiet toast, not a modal alert.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't mark that entry as done. Try again.")
    );
    // Still there — the list is only pruned once the server agrees.
    expect(markDoneButtons()).toHaveLength(1);
  });

  it("shows the caught-up message once the last entry is done", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    renderPage();

    await screen.findByText("Write the report");
    fireEvent.click(screen.getByRole("button", { name: /mark done/i }));

    expect(await screen.findByText("No open work")).toBeInTheDocument();
  });
});

describe("OpenWorkPage — what each row says", () => {
  it("opens the entry itself from its title", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(3) })] }));
    renderPage();

    expect(await screen.findByRole("link", { name: "Write the report" })).toHaveAttribute("href", "/projects/p1?entry=e1");
  });

  it("says when overdue work was due and how late it is", async () => {
    const due = at(-3);
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: due })] }));
    renderPage();

    const row = (await screen.findByRole("link", { name: "Campus Marketplace" })).closest("li")!;
    expect(row).toHaveTextContent(/Was due .* · 3 days ago/);
  });

  it("shows when undated work was opened, from the entry date or else its creation", async () => {
    const created = at(-7);
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ entryDate: null, createdAt: created })] })
    );
    renderPage();

    const row = (await screen.findByRole("link", { name: "Campus Marketplace" })).closest("li")!;
    const opened = new Date(created).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    expect(row).toHaveTextContent(`opened ${opened}`);
  });
});

describe("OpenWorkPage — dates", () => {
  const dayKey = (offset: number) => at(offset).slice(0, 10);

  it("adds a due date to undated work, which moves it into the plan", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: null })] }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /add a due date/i }));
    fireEvent.change(screen.getByLabelText(/due date for Write the report/i), { target: { value: dayKey(4) } });
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));

    // The same update the entry form makes, with only the date in it.
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/entries/e1", { dueDate: dayKey(4) }));
    const comingUp = screen.getByRole("region", { name: "Coming up" });
    expect(await within(comingUp).findByText("Write the report")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^No date yet/ })).toBeNull();
  });

  it("moves an overdue date forward", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(-2) })] }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /move date/i }));
    fireEvent.change(screen.getByLabelText(/new due date/i), { target: { value: dayKey(1) } });
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: /^Overdue/ })).toBeNull());
    expect(within(screen.getByRole("region", { name: "Coming up" })).getByText("Tomorrow")).toBeInTheDocument();
  });

  it("keeps the old date and says so when the change fails", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(-2) })] }));
    vi.mocked(api.put).mockRejectedValue(new Error("nope"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /move date/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't change that date. Try again."));
    expect(screen.getByRole("region", { name: "Overdue · 1" })).toBeInTheDocument();
  });

  it("shows a few undated items and offers the rest", async () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ id: `n${i}`, values: { "f-sum": `Idea ${i}` } }));
    vi.mocked(api.get).mockImplementation(serve({ p1: many }));
    renderPage();

    const backlog = await screen.findByRole("region", { name: "No date yet · 8" });
    expect(within(backlog).getAllByRole("button", { name: /mark done/i })).toHaveLength(5);
    fireEvent.click(within(backlog).getByRole("button", { name: "Show the other 3" }));
    expect(within(backlog).getAllByRole("button", { name: /mark done/i })).toHaveLength(8);
  });
});
