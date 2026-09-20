import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock the API module so no network calls happen
vi.mock("../../api", () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    { id: "p1", name: "Alpha Project", status: "ACTIVE", description: null },
    { id: "p2", name: "Beta Project", status: "ARCHIVED", description: null },
  ]),
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  fetchEntries: vi.fn().mockResolvedValue([]),
}));

import DashboardPage from "../../pages/DashboardPage";

function renderDashboard() {
  localStorage.setItem("logbook-name", "Test Student");
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the greeting with the user's name", async () => {
    renderDashboard();

    // The greeting changes based on time of day, so use a partial match
    expect(
      await screen.findByText(/Test Student/),
    ).toBeInTheDocument();
  });

  it("renders the stat cards", async () => {
    renderDashboard();

    expect(await screen.findByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Entries This Week")).toBeInTheDocument();
    expect(screen.getByText("Total Time Logged")).toBeInTheDocument();
  });

  it("renders the New Project button", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("button", { name: /new project/i }),
    ).toBeInTheDocument();
  });

  it("renders the Activity chart section", async () => {
    renderDashboard();

    expect(await screen.findByText("Activity")).toBeInTheDocument();
  });

  it("renders Current Projects section", async () => {
    renderDashboard();

    expect(
      await screen.findByText("Current Projects"),
    ).toBeInTheDocument();
  });

  it("shows 'No active projects' when all projects are archived", async () => {
    // Override the mock to return only archived projects
    const { fetchProjects } = await import("../../api");
    vi.mocked(fetchProjects).mockResolvedValueOnce([
      { id: "p1", name: "Old", status: "ARCHIVED", description: null },
    ] as any);

    renderDashboard();

    expect(
      await screen.findByText(/no active projects/i),
    ).toBeInTheDocument();
  });
});
