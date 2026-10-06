import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  // EntryForm loads the selected project's fields itself.
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  createEntry: vi.fn(),
  fetchDueReminderCount: vi.fn().mockResolvedValue(0),
  fetchDueReminders: vi.fn().mockResolvedValue([]),
  askAssistant: vi.fn(),
  REMINDERS_CHANGED_EVENT: "logbook-reminders-changed",
}));

// Stopwatch runs an interval; nothing here needs it ticking.
vi.mock("../Stopwatch", () => ({
  default: () => <div data-testid="stopwatch" />,
}));

import * as api from "../../api";
import AppLayout from "../AppLayout";

// Shows where the app is, so a test can read where navigation landed.
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const renderAt = (path = "/dashboard") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<Where />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const where = () => screen.getByTestId("where").textContent;

const PROJECTS = [
  { id: "old", name: "Old", status: "ARCHIVED" },
  { id: "p2", name: "Lab", status: "ACTIVE" },
  { id: "p7", name: "Thesis", status: "ACTIVE" },
];

/** Press N and return the quick-entry dialog once it is up. */
async function pressN() {
  fireEvent.keyDown(document.body, { key: "n" });
  return screen.findByRole("dialog", { name: /quick entry/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("token", "t");
});

describe("AppLayout — the N quick-capture shortcut (issue #92)", () => {
  it("opens the quick-entry dialog on the project last worked in", async () => {
    localStorage.setItem("logbook-last-project", "p7");
    vi.mocked(api.fetchProjects).mockResolvedValue(PROJECTS as never);
    renderAt();

    const dialog = await pressN();

    const selector = within(dialog).getByRole("combobox") as HTMLSelectElement;
    await waitFor(() => expect(selector.value).toBe("p7"));
  });

  it("falls back to the first active project when nothing is remembered", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue(PROJECTS as never);
    renderAt();

    fireEvent.keyDown(document.body, { key: "N" });

    const dialog = await screen.findByRole("dialog", { name: /quick entry/i });
    const selector = within(dialog).getByRole("combobox") as HTMLSelectElement;
    await waitFor(() => expect(selector.value).toBe("p2"));
  });

  it("stays put and says there is nothing to capture into without projects", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderAt();

    await pressN();

    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    expect(where()).toBe("/dashboard");
  });

  it("does nothing while the student is typing", async () => {
    renderAt();
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "n" });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    input.remove();
  });

  it("ignores N while the quick-entry dialog is already open", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue(PROJECTS as never);
    renderAt();

    await pressN();
    fireEvent.keyDown(document.body, { key: "n" });

    // One dialog, and exactly one project list fetch.
    expect(screen.getAllByRole("dialog", { name: /quick entry/i })).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.fetchProjects).toHaveBeenCalledTimes(1);
  });
});
