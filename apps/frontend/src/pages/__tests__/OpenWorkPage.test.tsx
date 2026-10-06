import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), patch: vi.fn() },
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
});

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

  it("congratulates an owner with nothing open", async () => {
    renderPage();

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByText("(0 open)")).toBeInTheDocument();
  });
});

describe("OpenWorkPage — gathering the work", () => {
  it("asks for every project's open entries in one request", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    renderPage();

    await screen.findByText("(1 open)");
    // One request however many projects there are, not one per project.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/me/open-entries");
  });

  it("gathers entries from every project into one list", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry()], p2: [entry({ id: "e2", projectId: "p2" })] })
    );
    renderPage();

    expect(await screen.findByText("(2 open)")).toBeInTheDocument();
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

  it("puts each entry under the heading its due date earns", async () => {
    vi.mocked(api.get).mockImplementation(spread());
    renderPage();

    // The count travels with the heading, so a miscounted bucket fails here.
    expect(await screen.findByText("Overdue (1)")).toBeInTheDocument();
    expect(screen.getByText("Due Today (1)")).toBeInTheDocument();
    expect(screen.getByText("Upcoming (1)")).toBeInTheDocument();
    expect(screen.getByText("No Due Date (1)")).toBeInTheDocument();
  });

  it("leaves out a heading no entry belongs under", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry({ dueDate: at(5) })] }));
    renderPage();

    expect(await screen.findByText("Upcoming (1)")).toBeInTheDocument();
    expect(screen.queryByText(/^Overdue/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Due Today/)).not.toBeInTheDocument();
  });

  it("counts several entries in the same bucket together", async () => {
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ id: "a", dueDate: at(-1) }), entry({ id: "b", dueDate: at(-4) })] })
    );
    renderPage();

    expect(await screen.findByText("Overdue (2)")).toBeInTheDocument();
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

    await screen.findByText("(1 open)");
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

    await screen.findByText("(2 open)");
    fireEvent.click(screen.getAllByRole("button", { name: /mark done/i })[0]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/entries/e1/status", { status: "DONE" })
    );
    expect(await screen.findByText("(1 open)")).toBeInTheDocument();
  });

  it("leaves the entry in place when the server refuses", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    vi.mocked(api.patch).mockRejectedValue(new Error("nope"));
    renderPage();

    await screen.findByText("(1 open)");
    fireEvent.click(screen.getByRole("button", { name: /mark done/i }));

    // The failure is a quiet toast, not a modal alert.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't mark that entry as done. Try again.")
    );
    // Still there — the list is only pruned once the server agrees.
    expect(screen.getByText("(1 open)")).toBeInTheDocument();
  });

  it("shows the caught-up message once the last entry is done", async () => {
    vi.mocked(api.get).mockImplementation(serve({ p1: [entry()] }));
    renderPage();

    await screen.findByText("(1 open)");
    fireEvent.click(screen.getByRole("button", { name: /mark done/i }));

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });
});

describe("OpenWorkPage — what each row says", () => {
  it("shows the entry date when it has one, and the due date beside it", async () => {
    const due = at(3);
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ entryDate: at(-1), dueDate: due })] })
    );
    renderPage();

    const row = (await screen.findByRole("link", { name: "Campus Marketplace" })).closest("li")!;
    expect(within(row).getByText(new RegExp(`due ${new Date(due).toLocaleDateString()}`))).toBeInTheDocument();
  });

  it("falls back to when the entry was created if it has no entry date", async () => {
    const created = at(-7);
    vi.mocked(api.get).mockImplementation(
      serve({ p1: [entry({ entryDate: null, createdAt: created })] })
    );
    renderPage();

    const row = (await screen.findByRole("link", { name: "Campus Marketplace" })).closest("li")!;
    expect(within(row).getByText(new Date(created).toLocaleDateString())).toBeInTheDocument();
  });
});
