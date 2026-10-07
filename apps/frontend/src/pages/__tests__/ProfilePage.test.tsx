import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

import { api } from "../../api/client";
import ProfilePage from "../ProfilePage";
import { localDateKey } from "../../lib/utils";

const daysAgo = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const profile = {
  id: "u1",
  email: "student@example.com",
  fullName: "Dineo Student",
  bio: null,
  avatar: null,
  studentNumber: "2816258",
  degree: "BSc Computer Science",
  yearOfStudy: "3rd Year",
  memberSince: "2026-02-01T00:00:00.000Z",
};

const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id, projectId: "p1", durationMinutes: 60, entryDate: null, createdAt: daysAgo(0),
  tags: [], status: "OPEN", values: {}, ...over,
});

function serve(entries: unknown[], { failProfile = false } = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/me") {
      if (failProfile) throw { response: { data: { error: "Your session has expired." } } };
      return { data: profile };
    }
    if (url === "/entries") return { data: { entries, truncated: false } };
    return { data: [{ id: "p1", name: "Digital Logbook" }, { id: "p2", name: "Portfolio" }] };
  });
}

const renderPage = () => render(<MemoryRouter><ProfilePage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe("ProfilePage", () => {
  it("shows who the student is from their stored details only", async () => {
    serve([]);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Dineo Student" })).toBeInTheDocument();
    expect(screen.getByText("BSc Computer Science · 3rd Year")).toBeInTheDocument();
    expect(screen.getByText("student@example.com")).toBeInTheDocument();
    expect(screen.getByText("2816258")).toBeInTheDocument();
    // The account's creation date, named for what it is.
    expect(screen.getByText(/Member since/)).toBeInTheDocument();
  });

  it("works its figures out from the real entries", async () => {
    serve([
      entry("e1", { tags: ["frontend", "design"] }),
      entry("e2", { createdAt: daysAgo(1), durationMinutes: 30, tags: ["frontend"] }),
      entry("e3", { projectId: "p2", createdAt: daysAgo(24), durationMinutes: 45 }),
    ]);
    renderPage();
    await screen.findByRole("heading", { name: "Dineo Student" });

    const stat = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;
    expect(stat("Entries")).toHaveTextContent("3");
    expect(stat("Logged")).toHaveTextContent("2h 15m");
    expect(stat("Streak")).toHaveTextContent("2 days");

    // Each day in the grid says what it holds, not only its colour.
    expect(screen.getAllByRole("img", { name: /^1 entry on/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("3 entries on 3 days in these twelve weeks.")).toBeInTheDocument();

    // Most recently active first, with a date worked out from today.
    const projects = screen.getByRole("heading", { name: "Recent projects" }).closest("section")!;
    const rows = within(projects).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Digital Logbook2 entries · 1h 30m · today");
    expect(rows[1]).toHaveTextContent("Portfolio1 entry · 45m · 24 days ago");

    const tags = screen.getByRole("heading", { name: "Tags" }).closest("section")!;
    expect(within(tags).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["frontend2", "design1"]);
  });

  it("says plainly when there is nothing logged yet", async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText("Nothing logged yet. Your first entry will show up here.")).toBeInTheDocument();
    expect(screen.getByText("No projects with entries yet.")).toBeInTheDocument();
    expect(screen.getByText("No tags used yet.")).toBeInTheDocument();
  });

  it("edits and saves the profile the same way as before", async () => {
    serve([]);
    vi.mocked(api.patch).mockResolvedValue({ data: { ...profile, bio: "Building a logbook" } } as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Building a logbook" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/me", expect.objectContaining({ bio: "Building a logbook" })));
    expect(await screen.findByText("Building a logbook")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Profile saved.");
  });

  it("explains a failed load and offers to try again", async () => {
    serve([], { failProfile: true });
    renderPage();
    expect(await screen.findByText("Your session has expired.")).toBeInTheDocument();

    serve([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Dineo Student" })).toBeInTheDocument();
  });

  it("covers twelve whole weeks ending this week", async () => {
    serve([entry("e1")]);
    renderPage();
    await screen.findByRole("heading", { name: "Dineo Student" });
    const today = new Date(`${localDateKey(new Date())}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    expect(screen.getByRole("img", { name: `1 entry on ${today}` })).toBeInTheDocument();
  });
});
