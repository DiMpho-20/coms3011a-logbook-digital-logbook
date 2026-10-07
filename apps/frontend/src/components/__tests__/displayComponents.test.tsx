import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatusBadge from "../StatusBadge";
import TagList from "../TagList";
import EntryCard from "../EntryCard";
import ProjectCard from "../ProjectCard";
import type { Entry, EntryField, Project, TimeSummary } from "../../api";

const field = (id: string, name: string, type: string): EntryField =>
  ({ id, name, type, required: false, projectId: "p1", formula: null }) as unknown as EntryField;

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    projectId: "p1",
    durationMinutes: 90,
    entryDate: null,
    dueDate: null,
    values: {},
    status: "OPEN",
    completedAt: null,
    tags: [],
    format: null,
    createdAt: "2026-09-01T10:30:00.000Z",
    updatedAt: "2026-09-01T10:30:00.000Z",
    ...overrides,
  } as Entry;
}

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Campus Marketplace",
    description: "A description",
    status: "ACTIVE",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Project;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("StatusBadge", () => {
  it("names the status it is given", () => {
    const { rerender } = render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<StatusBadge status="ARCHIVED" />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

describe("TagList", () => {
  it("renders a chip per tag", () => {
    render(<TagList tags={["coursework", "urgent"]} />);
    expect(screen.getByText("coursework")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders nothing at all when there are no tags", () => {
    const { container: empty } = render(<TagList tags={[]} />);
    expect(empty).toBeEmptyDOMElement();

    const { container: missing } = render(<TagList tags={undefined} />);
    expect(missing).toBeEmptyDOMElement();
  });
});

describe("EntryCard", () => {
  // Reference and project-chip values render as react-router <Link>s, which
  // throw outside a Router context.
  const renderCard = (props: Parameters<typeof EntryCard>[0]) =>
    render(
      <MemoryRouter>
        <EntryCard {...props} />
      </MemoryRouter>
    );

  it("shows the duration and the project chip when asked", () => {
    renderCard({ entry: makeEntry(), projectName: "Campus Marketplace", showProject: true });

    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("Campus Marketplace")).toBeInTheDocument();
  });

  it("omits the project chip unless showProject is set", () => {
    renderCard({ entry: makeEntry(), projectName: "Campus Marketplace" });
    expect(screen.queryByText("Campus Marketplace")).not.toBeInTheDocument();
  });

  it("marks an entry overdue only when its due date has passed", () => {
    const { unmount } = renderCard({ entry: makeEntry({ dueDate: daysAgo(3) }) });
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    unmount();

    renderCard({ entry: makeEntry({ dueDate: daysAgo(-3) }) });
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("labels a recurring entry and lets the parent stop future occurrences", () => {
    const stop = vi.fn();
    renderCard({
      entry: makeEntry({
        recurrence: {
          id: "r1",
          pattern: "WEEKLY",
          enabled: true,
          nextOccurrence: "2026-09-08T10:30:00.000Z",
          until: null,
        },
      }),
      onDisableRecurrence: stop,
    });

    expect(screen.getByText("weekly")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop recurrence" }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("renders each field type the way a reader expects", () => {
    const fields = [
      field("f-bool", "Billable", "BOOLEAN"),
      field("f-tags", "Topics", "TAGS"),
      field("f-check", "Steps", "CHECKLIST"),
      field("f-ref", "Related", "REFERENCE"),
      field("f-text", "Summary", "TEXT"),
    ];
    const entry = makeEntry({
      values: {
        "f-bool": false,
        "f-tags": ["audit", "phase-a"],
        "f-check": [
          { label: "Draft", checked: true },
          { label: "Review", checked: false },
        ],
        "f-ref": { id: "p2", label: "Digital Logbook", kind: "project" },
        "f-text": "wrote the audit",
      } as Entry["values"],
    });

    renderCard({ entry, fields });

    // false must render as "No" rather than being dropped as empty.
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("audit, phase-a")).toBeInTheDocument();
    // Checklist items render as individually tickable checkboxes, not a
    // single summary string.
    const draft = screen.getByText("Draft").closest("label")!;
    expect(within(draft).getByRole("checkbox")).toBeChecked();
    const review = screen.getByText("Review").closest("label")!;
    expect(within(review).getByRole("checkbox")).not.toBeChecked();
    // A REFERENCE value links to the project it points at.
    expect(screen.getByRole("link", { name: "Digital Logbook" })).toHaveAttribute("href", "/projects/p2");
    expect(screen.getByText("wrote the audit")).toBeInTheDocument();
  });

  it("routes an entry-to-entry reference into the linked entry's project", () => {
    const fields = [field("f-ref", "Related", "REFERENCE")];
    const entry = makeEntry({
      values: {
        "f-ref": { id: "e9", label: "Reading · Sep 30 · chapter two", kind: "entry", projectId: "p7" },
      } as Entry["values"],
    });

    renderCard({ entry, fields });

    expect(screen.getByRole("link", { name: "Reading · Sep 30 · chapter two" })).toHaveAttribute(
      "href",
      "/projects/p7?entry=e9"
    );
  });

  it("skips a field the entry never filled in", () => {
    const fields = [field("f1", "Summary", "TEXT"), field("f2", "Notes", "TEXT")];
    renderCard({ entry: makeEntry({ values: { f1: "only this one" } as Entry["values"] }), fields });

    expect(screen.getByText("only this one")).toBeInTheDocument();
    // Field names render as "Name:", so match loosely.
    expect(screen.getByText(/Summary/)).toBeInTheDocument();
    expect(screen.queryByText(/Notes/)).not.toBeInTheDocument();
  });

  it("prefers the entry's own format snapshot over the project's current fields", () => {
    const entry = makeEntry({
      values: { "old-f": "recorded under the old format" } as Entry["values"],
      format: { version: 2, fields: [field("old-f", "Historic field", "TEXT")] } as Entry["format"],
    });

    renderCard({ entry, fields: [field("new-f", "Current field", "TEXT")] });

    expect(screen.getByText(/Historic field/)).toBeInTheDocument();
    expect(screen.queryByText(/Current field/)).not.toBeInTheDocument();
  });

  it("offers edit and delete only when a handler is supplied", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const entry = makeEntry();

    const { unmount } = renderCard({ entry });
    expect(screen.queryByLabelText("Edit entry")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete entry")).not.toBeInTheDocument();
    unmount();

    renderCard({ entry, onEdit, onDelete });
    fireEvent.click(screen.getByLabelText("Edit entry"));
    fireEvent.click(screen.getByLabelText("Delete entry"));

    expect(onEdit).toHaveBeenCalledWith(entry);
    expect(onDelete).toHaveBeenCalledWith(entry);
  });
});

describe("ProjectCard", () => {
  const renderCard = (props: Partial<Parameters<typeof ProjectCard>[0]> = {}) =>
    render(
      <MemoryRouter>
        <ProjectCard
          project={project()}
          onEdit={vi.fn()}
          onToggleArchive={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    );

  it("shows an em dash rather than a zero while the summary is still loading", () => {
    renderCard();
    // "0 entries" and "0m" would be assertions of fact about data that has
    // not arrived — BUG-014 made this deliberate.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 entries/)).not.toBeInTheDocument();
  });

  it("shows the real figures once the summary arrives", () => {
    const summary = { projectId: "p1", totalMinutes: 140, totalHours: 2.3, entryCount: 3, lastEntryAt: daysAgo(0) } as TimeSummary;
    renderCard({ summary });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("entries")).toBeInTheDocument();
    expect(screen.getByText("2h 20m")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("says 'entry' in the singular", () => {
    renderCard({ summary: { projectId: "p1", totalMinutes: 10, totalHours: 0.2, entryCount: 1, lastEntryAt: daysAgo(1) } as TimeSummary });
    expect(screen.getByText("entry")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("describes a project that has a summary but no entries yet", () => {
    renderCard({ summary: { projectId: "p1", totalMinutes: 0, totalHours: 0, entryCount: 0, lastEntryAt: null } as TimeSummary });
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("dates older activity in days", () => {
    renderCard({ summary: { projectId: "p1", totalMinutes: 5, totalHours: 0.1, entryCount: 1, lastEntryAt: daysAgo(3) } as TimeSummary });
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });

  it("notes an active project that has gone quiet, but not a recent or archived one", () => {
    const quiet = { projectId: "p1", totalMinutes: 5, totalHours: 0.1, entryCount: 1, lastEntryAt: daysAgo(20) } as TimeSummary;
    const { unmount } = renderCard({ summary: quiet });
    // A status in words with an icon, in place of "Active".
    expect(screen.getByText("Quiet")).toBeInTheDocument();
    expect(screen.queryByText("Active")).toBeNull();
    unmount();
    renderCard({ summary: quiet, project: project({ status: "ARCHIVED" }) });
    expect(screen.queryByText("Quiet")).toBeNull();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("can be opened from the keyboard through its name", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "Campus Marketplace" })).toHaveAttribute("href", "/projects/p1");
  });

  it("calls back on edit and archive without navigating", () => {
    const onEdit = vi.fn();
    const onToggleArchive = vi.fn();
    renderCard({ onEdit, onToggleArchive });

    const more = screen.getByRole("button", { name: "More actions for Campus Marketplace" });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit project" }));
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    expect(onEdit).toHaveBeenCalled();
    expect(onToggleArchive).toHaveBeenCalled();
  });

  it("offers to unarchive an archived project", () => {
    renderCard({ project: project({ status: "ARCHIVED" }) });
    fireEvent.click(screen.getByRole("button", { name: "More actions for Campus Marketplace" }));
    expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
  });
});
