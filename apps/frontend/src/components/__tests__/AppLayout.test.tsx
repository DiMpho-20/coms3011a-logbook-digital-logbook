import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchProjects: vi.fn(),
  fetchDueReminderCount: vi.fn().mockResolvedValue(0),
  fetchDueReminders: vi.fn().mockResolvedValue([]),
  REMINDERS_CHANGED_EVENT: "logbook-reminders-changed",
}));

import * as api from "../../api";
import AppLayout from "../AppLayout";

// Shows where the app is, so a test can read where N took it.
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("token", "t");
});

describe("AppLayout — the N quick-capture shortcut (issue #92)", () => {
  it("opens a new entry on the project last worked in", async () => {
    localStorage.setItem("logbook-last-project", "p7");
    renderAt();

    fireEvent.keyDown(document.body, { key: "n" });

    await waitFor(() => expect(where()).toBe("/projects/p7?new=1"));
    expect(api.fetchProjects).not.toHaveBeenCalled();
  });

  it("falls back to the first active project", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      { id: "old", status: "ARCHIVED" },
      { id: "p2", status: "ACTIVE" },
    ] as never);
    renderAt();

    fireEvent.keyDown(document.body, { key: "N" });

    await waitFor(() => expect(where()).toBe("/projects/p2?new=1"));
  });

  it("goes to the projects page when there is no project to add to", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue([] as never);
    renderAt();

    fireEvent.keyDown(document.body, { key: "n" });

    await waitFor(() => expect(where()).toBe("/projects"));
  });

  it("does nothing while the student is typing", async () => {
    localStorage.setItem("logbook-last-project", "p7");
    renderAt();
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "n" });

    await new Promise((r) => setTimeout(r, 50));
    expect(where()).toBe("/dashboard");
    input.remove();
  });
});
