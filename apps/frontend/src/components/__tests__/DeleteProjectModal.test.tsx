import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../api", () => ({
  deleteProject: vi.fn(),
}));

import * as api from "../../api";
import DeleteProjectModal from "../DeleteProjectModal";
import type { Project } from "../../api";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Campus Marketplace",
    description: "Second-hand trading",
    status: "ACTIVE",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as Project;

const setup = (props: Partial<React.ComponentProps<typeof DeleteProjectModal>> = {}) => {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(
    <DeleteProjectModal project={project()} onClose={onClose} onDeleted={onDeleted} {...props} />
  );
  return { onClose, onDeleted, ...utils };
};

const deleteButton = () => screen.getByRole("button", { name: /delete permanently/i });
const nameBox = () => screen.getByLabelText(/to confirm/i);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.deleteProject).mockResolvedValue(3);
});

describe("DeleteProjectModal — what it says", () => {
  it("renders nothing while no project is chosen", () => {
    setup({ project: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the project and how many entries go with it", () => {
    setup({ entryCount: 3 });
    expect(screen.getByRole("dialog", { name: "Delete Campus Marketplace?" })).toBeInTheDocument();
    expect(screen.getByText(/its 3 entries/)).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
  });

  it("says 'its 1 entry' for a single entry", () => {
    setup({ entryCount: 1 });
    expect(screen.getByText(/its 1 entry\b/)).toBeInTheDocument();
  });

  it("says 'all of its entries' when the count isn't known", () => {
    setup();
    expect(screen.getByText(/all of its entries/)).toBeInTheDocument();
  });
});

describe("DeleteProjectModal — the typed-name guard", () => {
  it("keeps Delete disabled until the project's name is typed exactly", () => {
    setup();
    expect(deleteButton()).toBeDisabled();

    fireEvent.change(nameBox(), { target: { value: "Campus" } });
    expect(deleteButton()).toBeDisabled();

    fireEvent.change(nameBox(), { target: { value: "  Campus Marketplace " } });
    expect(deleteButton()).toBeEnabled();
  });

  it("ignores Enter before the name matches", () => {
    setup();
    fireEvent.change(nameBox(), { target: { value: "wrong" } });
    fireEvent.keyDown(nameBox(), { key: "Enter" });
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it("deletes and reports back once confirmed", async () => {
    const { onDeleted } = setup();
    fireEvent.change(nameBox(), { target: { value: "Campus Marketplace" } });
    fireEvent.click(deleteButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" })));
    expect(api.deleteProject).toHaveBeenCalledWith("p1");
  });

  it("deletes on Enter once the name matches", async () => {
    const { onDeleted } = setup();
    fireEvent.change(nameBox(), { target: { value: "Campus Marketplace" } });
    fireEvent.keyDown(nameBox(), { key: "Enter" });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("clears the typed name when a different project is opened", () => {
    const { rerender, onClose, onDeleted } = setup();
    fireEvent.change(nameBox(), { target: { value: "Campus Marketplace" } });
    rerender(
      <DeleteProjectModal project={project({ id: "p2", name: "Thesis" })} onClose={onClose} onDeleted={onDeleted} />
    );
    expect(nameBox()).toHaveValue("");
    expect(deleteButton()).toBeDisabled();
  });
});

describe("DeleteProjectModal — failures", () => {
  const confirmAndDelete = () => {
    fireEvent.change(nameBox(), { target: { value: "Campus Marketplace" } });
    fireEvent.click(deleteButton());
  };

  it("shows the server's message and lets the student try again", async () => {
    vi.mocked(api.deleteProject).mockRejectedValue({ response: { data: { error: "Project not found" } } });
    const { onDeleted } = setup();
    confirmAndDelete();

    expect(await screen.findByText("Project not found")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();
  });

  it("falls back to a generic message when the server gives none", async () => {
    vi.mocked(api.deleteProject).mockRejectedValue({ response: { status: 500 } });
    setup();
    confirmAndDelete();
    expect(await screen.findByText(/couldn't delete the project/i)).toBeInTheDocument();
  });

  it("explains that deleting needs a connection when the request never reached the server", async () => {
    vi.mocked(api.deleteProject).mockRejectedValue(new Error("Network Error"));
    setup();
    confirmAndDelete();
    expect(await screen.findByText(/need to be online/i)).toBeInTheDocument();
  });
});

describe("DeleteProjectModal — the other ways out", () => {
  it("offers Archive instead for an active project, without deleting", () => {
    const onArchiveInstead = vi.fn();
    setup({ onArchiveInstead });
    fireEvent.click(screen.getByRole("button", { name: /archive instead/i }));

    expect(onArchiveInstead).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it("doesn't offer archiving for a project that is already archived", () => {
    setup({ project: project({ status: "ARCHIVED" }), onArchiveInstead: vi.fn() });
    expect(screen.queryByRole("button", { name: /archive instead/i })).not.toBeInTheDocument();
  });

  it("doesn't offer archiving when the caller can't archive", () => {
    setup();
    expect(screen.queryByRole("button", { name: /archive instead/i })).not.toBeInTheDocument();
  });

  it("closes on Cancel", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
