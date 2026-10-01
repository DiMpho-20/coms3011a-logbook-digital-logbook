import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
