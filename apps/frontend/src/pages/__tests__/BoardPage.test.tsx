import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({ api: { get: vi.fn() } }));

import { api } from "../../api/client";
import BoardPage from "../BoardPage";
import { columnLabel } from "../../lib/utils";

describe("columnLabel", () => {
  it("names a reference column by its label (#89)", () => {
    expect(columnLabel({ id: "p1", label: "Thesis" })).toBe("Thesis");
  });

  it("falls back to the id when a reference has no label", () => {
    expect(columnLabel({ id: "p1" })).toBe("p1");
  });

  it("joins lists of tags and checklist items", () => {
    expect(columnLabel(["urgent", "lab"])).toBe("urgent, lab");
    expect(columnLabel([{ label: "Draft", checked: true }])).toBe("Draft");
  });

  it("keeps plain values and puts empty ones under a dash", () => {
    expect(columnLabel(4)).toBe("4");
    expect(columnLabel(true)).toBe("true");
    expect(columnLabel("")).toBe("—");
    expect(columnLabel(null)).toBe("—");
    expect(columnLabel(undefined)).toBe("—");
  });
});

describe("BoardPage grouped by a reference field", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/projects") return { data: [{ id: "proj", name: "Research" }] };
      if (url.endsWith("/entry-fields")) return { data: [{ id: "ref", name: "Related", type: "REFERENCE" }] };
      return {
        data: [
          { id: "e1", projectId: "proj", entryDate: null, createdAt: "2026-09-01", durationMinutes: 0, values: { ref: { id: "x", label: "Thesis" } } },
          { id: "e2", projectId: "proj", entryDate: null, createdAt: "2026-09-02", durationMinutes: 0, values: { ref: { id: "y" } } },
        ],
      };
    });
  });

  it("shows the referenced item's name, never [object Object]", async () => {
    render(
      <MemoryRouter initialEntries={["/board?project=proj"]}>
        <BoardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Thesis")).toBeInTheDocument();
    expect(screen.getByText("y")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });
});

describe("BoardPage columns and cards", () => {
  const renderBoard = () =>
    render(
      <MemoryRouter initialEntries={["/board?project=proj"]}>
        <BoardPage />
      </MemoryRouter>
    );

  const mockProject = (fields: unknown[], entries: unknown[]) =>
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/projects") return { data: [{ id: "proj", name: "Research", status: "ACTIVE" }] };
      if (url.endsWith("/entry-fields")) return { data: fields };
      return { data: entries };
    });

  const entry = (id: string, values: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    id, projectId: "proj", entryDate: "2026-09-01", createdAt: "2026-09-01", durationMinutes: 30, status: "OPEN", values, ...over,
  });

  it("names each card by its description, not just its time", async () => {
    mockProject([{ id: "sum", name: "Summary", type: "TEXT" }], [entry("e1", { sum: "Wrote the intro" })]);
    renderBoard();
    expect(await screen.findByText("Wrote the intro")).toBeInTheDocument();
  });

  it("groups by status when the project has no field that repeats, open before done", async () => {
    mockProject(
      [{ id: "sum", name: "Summary", type: "TEXT" }],
      [entry("e1", { sum: "Finished" }, { status: "DONE" }), entry("e2", { sum: "Still going" })]
    );
    renderBoard();
    await screen.findByText("Still going");
    const headings = screen.getAllByTitle(/^(Open|Done)$/).map((el) => el.textContent);
    expect(headings).toEqual(["Open", "Done"]);
  });

  it("puts an entry under each of its tags rather than one joined column", async () => {
    mockProject(
      [{ id: "sum", name: "Summary", type: "TEXT" }, { id: "tags", name: "Topics", type: "TAGS" }],
      [entry("e1", { sum: "Both", tags: ["ml", "thesis"] }), entry("e2", { sum: "Untagged", tags: [] })]
    );
    renderBoard();
    await screen.findAllByText("Both");
    expect(screen.getByTitle("ml")).toBeInTheDocument();
    expect(screen.getByTitle("thesis")).toBeInTheDocument();
    expect(screen.queryByTitle("ml, thesis")).toBeNull();
    expect(screen.getAllByText("Both")).toHaveLength(2);
    expect(screen.getByTitle("—")).toBeInTheDocument();
  });

  it("names yes/no columns in words", async () => {
    mockProject(
      [{ id: "sum", name: "Summary", type: "TEXT" }, { id: "rev", name: "Reviewed", type: "BOOLEAN" }],
      [entry("e1", { sum: "A", rev: true }), entry("e2", { sum: "B", rev: false })]
    );
    renderBoard();
    expect(await screen.findByTitle("Yes")).toBeInTheDocument();
    expect(screen.getByTitle("No")).toBeInTheDocument();
  });

  it("calls the no-value column 'Not grouped' and says what it holds", async () => {
    mockProject(
      [{ id: "sum", name: "Summary", type: "TEXT" }, { id: "tags", name: "Topics", type: "TAGS" }],
      [entry("e1", { sum: "Tagged", tags: ["ml"] }), entry("e2", { sum: "Untagged", tags: [] })]
    );
    renderBoard();
    const column = await screen.findByRole("listitem", { name: "Not grouped, 1 entry" });
    expect(within(column).getByText("Entries with no Topics set.")).toBeInTheDocument();
    expect(within(column).getByText("Untagged")).toBeInTheDocument();
  });

  it("keeps both status columns, saying when one is empty", async () => {
    mockProject([{ id: "sum", name: "Summary", type: "TEXT" }], [entry("e1", { sum: "Still going" })]);
    renderBoard();
    const done = await screen.findByRole("listitem", { name: "Done, 0 entries" });
    expect(within(done).getByText("No entries here yet.")).toBeInTheDocument();
  });

  it("opens the entry itself, and shows its due date as context", async () => {
    mockProject(
      [{ id: "sum", name: "Summary", type: "TEXT" }],
      [entry("e1", { sum: "Contact form" }, { dueDate: "2026-10-12T00:00:00.000Z" })]
    );
    renderBoard();
    const card = (await screen.findByText("Contact form")).closest("a")!;
    expect(card).toHaveAttribute("href", "/projects/proj?entry=e1");
    expect(card).toHaveTextContent(/Due (12 Oct|Oct 12)/);
  });

  it("offers to try again when the entries cannot be loaded", async () => {
    let fail = true;
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/projects") return { data: [{ id: "proj", name: "Research", status: "ACTIVE" }] };
      if (fail) throw new Error("Network Error");
      if (url.endsWith("/entry-fields")) return { data: [{ id: "sum", name: "Summary", type: "TEXT" }] };
      return { data: [entry("e1", { sum: "Back again" })] };
    });
    renderBoard();
    await screen.findByText(/Couldn't load this project's entries/);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back again")).toBeInTheDocument();
  });

  it("says the projects failed rather than that there are none", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Network Error"));
    renderBoard();
    expect(await screen.findByText("Your projects couldn't be loaded")).toBeInTheDocument();
    expect(screen.queryByText("No projects yet.")).toBeNull();
  });

  it("says so when the entries cannot be loaded", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/projects") return { data: [{ id: "proj", name: "Research", status: "ACTIVE" }] };
      throw new Error("Network Error");
    });
    renderBoard();
    expect(await screen.findByText(/Couldn't load this project's entries/)).toBeInTheDocument();
  });
});
