import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProject: vi.fn(),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchProjectTimeSummary: vi.fn().mockResolvedValue({ totalMinutes: 0, entryCount: 0, lastEntryAt: null }),
  fetchEntries: vi.fn().mockResolvedValue([]),
  fetchEntryFields: vi.fn(),
  fetchEntryFormatVersions: vi.fn().mockResolvedValue([]),
  fetchTags: vi.fn().mockResolvedValue([]),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  toggleProjectStatus: vi.fn(),
  setEntryArchived: vi.fn(),
  setEntriesArchived: vi.fn(),
  setRecurrenceEnabled: vi.fn(),
  fetchAutomationRules: vi.fn().mockResolvedValue([]),
  createAutomationRule: vi.fn(),
  updateAutomationRule: vi.fn(),
  deleteAutomationRule: vi.fn(),
  fetchEntryHistory: vi.fn(),
  fetchEntryAtDate: vi.fn(),
  restoreEntryVersion: vi.fn(),
  deleteProject: vi.fn(),
}));

import * as api from "../../api";
import { ToastProvider } from "../../components/Toast";
import ProjectDetailPage from "../ProjectDetailPage";

const FIELD = { id: "f1", projectId: "p1", name: "Summary", type: "TEXT", required: false };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/projects/:id"
          element={
            <>
              <ToastProvider>
                <ProjectDetailPage />
              </ToastProvider>
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.fetchProject).mockResolvedValue({
    id: "p1", name: "Thesis", description: "", status: "ACTIVE", fields: [FIELD], tags: [],
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  } as never);
  vi.mocked(api.fetchEntryFields).mockResolvedValue([FIELD] as never);
  vi.mocked(api.createEntry).mockResolvedValue({
    id: "e1", projectId: "p1", durationMinutes: 0, values: { f1: "Wrote it" }, tags: [], status: "OPEN",
    entryDate: null, dueDate: null, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z",
  } as never);
});

describe("ProjectDetailPage — quick capture (issue #92)", () => {
  it("remembers the project so N can come back to it", async () => {
    renderAt("/projects/p1");
    await screen.findByText("Thesis");
    expect(localStorage.getItem("logbook-last-project")).toBe("p1");
  });

  it("opens a new entry, with the cursor in the first field, when arriving from N", async () => {
    renderAt("/projects/p1?new=1");

    const dialog = await screen.findByRole("dialog", { name: "New Entry" });
    await waitFor(() => expect(dialog.querySelector("textarea")).toHaveFocus());
    // The flag is dropped, so a reload does not open the form again.
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1"));
  });

  it("does not open the form on a normal visit", async () => {
    renderAt("/projects/p1");
    await screen.findByText("Thesis");
    expect(screen.queryByRole("dialog", { name: "New Entry" })).not.toBeInTheDocument();
  });

  it("saves the entry with Ctrl+Enter", async () => {
    renderAt("/projects/p1?new=1");
    const dialog = await screen.findByRole("dialog", { name: "New Entry" });
    const summary = dialog.querySelector("textarea")!;

    fireEvent.change(summary, { target: { value: "Wrote it" } });
    fireEvent.keyDown(summary, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(api.createEntry).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createEntry).mock.calls[0][0]).toBe("p1");
  });

  it("does not save on a plain Enter, which belongs to the field", async () => {
    renderAt("/projects/p1?new=1");
    const dialog = await screen.findByRole("dialog", { name: "New Entry" });

    fireEvent.keyDown(dialog.querySelector("textarea")!, { key: "Enter" });

    await new Promise((r) => setTimeout(r, 50));
    expect(api.createEntry).not.toHaveBeenCalled();
  });

  it("forgets a project that no longer loads", async () => {
    localStorage.setItem("logbook-last-project", "gone");
    vi.mocked(api.fetchProject).mockRejectedValue(new Error("Project not found"));
    renderAt("/projects/gone");

    await waitFor(() => expect(localStorage.getItem("logbook-last-project")).toBeNull());
  });
});
