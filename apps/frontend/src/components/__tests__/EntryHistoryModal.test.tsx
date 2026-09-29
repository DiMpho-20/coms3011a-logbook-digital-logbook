import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  fetchEntryHistory: vi.fn(),
  fetchEntryAtDate: vi.fn(),
  restoreEntryVersion: vi.fn(),
}));

import * as api from "../../api";
import EntryHistoryModal from "../EntryHistoryModal";
import type { Entry, EntryField, EntryHistory, EntrySnapshot, EntryVersion } from "../../api";

const NOTES = "f-notes";
const HOURS = "f-hours";

const fields = [
  { id: NOTES, name: "Notes", type: "TEXT", required: false, projectId: "p1", formula: null },
  { id: HOURS, name: "Hours", type: "NUMBER", required: false, projectId: "p1", formula: null },
] as unknown as EntryField[];

const snapshot = (over: Partial<EntrySnapshot> = {}): EntrySnapshot =>
  ({
    durationMinutes: 30,
    entryDate: "2026-09-01",
    dueDate: null,
    values: { [NOTES]: "first draft", [HOURS]: 1 },
    status: "OPEN",
    completedAt: null,
    tags: [],
    format: null,
    ...over,
  }) as EntrySnapshot;

const version = (n: number, over: Partial<EntryVersion> = {}): EntryVersion => ({
  version: n,
  reason: n === 1 ? "CREATED" : "UPDATED",
  restoredFromVersion: null,
  createdAt: `2026-09-0${n}T10:00:00.000Z`,
  snapshot: snapshot(),
  ...over,
});

const entry = {
  id: "e1",
  projectId: "p1",
  ...snapshot(),
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  archivedAt: null,
} as Entry;

/** Two versions: the entry was created, then edited to 90 minutes and new notes. */
const twoVersions: EntryHistory = {
  entryId: "e1",
  entryCreatedAt: "2026-09-01T10:00:00.000Z",
  currentVersion: 2,
  versions: [
    version(1),
    version(2, { snapshot: snapshot({ durationMinutes: 90, status: "DONE", values: { [NOTES]: "final notes", [HOURS]: 1 } }) }),
  ],
};

const setup = (props: Partial<React.ComponentProps<typeof EntryHistoryModal>> = {}) => {
  const onClose = vi.fn();
  const onRestored = vi.fn();
  const utils = render(
    <MemoryRouter>
      <EntryHistoryModal entry={entry} fields={fields} onClose={onClose} onRestored={onRestored} {...props} />
    </MemoryRouter>
  );
  return { onClose, onRestored, ...utils };
};

const versionButton = (n: number) => screen.getByRole("button", { name: new RegExp(`^Version ${n}(?!\\d)`) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchEntryHistory).mockResolvedValue(twoVersions);
});

describe("EntryHistoryModal — loading", () => {
  it("renders nothing while no entry is chosen", () => {
    setup({ entry: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.fetchEntryHistory).not.toHaveBeenCalled();
  });

  it("shows a loading state, then the versions oldest first", async () => {
    setup();
    expect(screen.getByText(/loading history/i)).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Versions" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Version 1");
    expect(items[0]).toHaveTextContent("Created");
    expect(items[1]).toHaveTextContent("Version 2");
    expect(items[1]).toHaveTextContent("Edited");
    expect(items[1]).toHaveTextContent("Current");
    expect(api.fetchEntryHistory).toHaveBeenCalledWith("e1");
  });

  // Restore used to appear only after selecting an older version, which read
  // as "history is view-only". It is now offered on every earlier version
  // from the moment the dialog opens — never on the current one.
  it("opens on the current version, offering Restore on each earlier version", async () => {
    setup();
    await screen.findByText("Current version");
    expect(versionButton(2)).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText(/differences from the current version/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore version 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore version 2" })).not.toBeInTheDocument();
    expect(screen.getByText(/click restore under it in the list/i)).toBeInTheDocument();
  });

  it("goes straight to the confirmation from a version's Restore button", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Restore version 1" }));
    expect(versionButton(1)).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /confirm restore/i })).toBeInTheDocument();
    expect(api.restoreEntryVersion).not.toHaveBeenCalled();
  });

  it("says so when the history can't be loaded", async () => {
    vi.mocked(api.fetchEntryHistory).mockRejectedValue(new Error("offline"));
    setup();
    expect(await screen.findByText(/couldn't load this entry's history/i)).toBeInTheDocument();
  });

  it("notes when an entry has never been changed", async () => {
    vi.mocked(api.fetchEntryHistory).mockResolvedValue({ ...twoVersions, currentVersion: 1, versions: [version(1)] });
    setup();
    expect(await screen.findByText(/hasn't been changed since it was created/i)).toBeInTheDocument();
  });

  it("labels a restored version with where it came from", async () => {
    vi.mocked(api.fetchEntryHistory).mockResolvedValue({
      ...twoVersions,
      currentVersion: 3,
      versions: [...twoVersions.versions, version(3, { reason: "RESTORED", restoredFromVersion: 1 })],
    });
    setup();
    expect(await screen.findByText("Restored from version 1")).toBeInTheDocument();
  });
});

describe("EntryHistoryModal — comparing an older version", () => {
  it("lists only what changed, field by field", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual(
      expect.arrayContaining(["Time spent30m1h 30m", "StatusOpenDone", "Notesfirst draftfinal notes"])
    );
    // Hours is 1 in both versions, so it isn't listed.
    expect(rows.some((r) => r?.startsWith("Hours"))).toBe(false);
  });

  it("says when an older version has the same content as the current one", async () => {
    vi.mocked(api.fetchEntryHistory).mockResolvedValue({
      ...twoVersions,
      versions: [version(1), version(2)],
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    expect(screen.getByText(/same content as the current version/i)).toBeInTheDocument();
  });

  it("describes empty, yes/no, checklist and removed-field values readably", async () => {
    vi.mocked(api.fetchEntryHistory).mockResolvedValue({
      ...twoVersions,
      versions: [
        version(1, {
          snapshot: snapshot({
            values: { [NOTES]: "", done: true, list: [{ label: "Draft", checked: true }], ref: { id: "t7", label: "Ticket 7" } },
          }),
        }),
        version(2, {
          snapshot: snapshot({
            values: { [NOTES]: "filled", done: false, list: [{ label: "Draft", checked: false }], ref: { id: "t8" } },
          }),
        }),
      ],
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual(
      expect.arrayContaining([
        "Notes(empty)filled",
        "Removed fieldYesNo",
        "Removed field☑ Draft☐ Draft",
        "Removed fieldTicket 7t8",
      ])
    );
  });
});

describe("EntryHistoryModal — restoring", () => {
  const restored = {
    entry: { ...entry, durationMinutes: 30 },
    version: version(3, { reason: "RESTORED", restoredFromVersion: 1 }),
    skippedFields: 0,
  };

  beforeEach(() => {
    vi.mocked(api.restoreEntryVersion).mockResolvedValue(restored as never);
    // The history is reloaded after a restore, and by then it holds the new version.
    vi.mocked(api.fetchEntryHistory).mockImplementation(async () =>
      vi.mocked(api.restoreEntryVersion).mock.calls.length > 0
        ? { ...twoVersions, currentVersion: 3, versions: [...twoVersions.versions, restored.version] }
        : twoVersions
    );
  });

  it("asks for confirmation, and Cancel backs out without restoring", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));

    expect(screen.getByText(/make version 1 the current entry/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/make version 1 the current entry/i)).not.toBeInTheDocument();
    expect(api.restoreEntryVersion).not.toHaveBeenCalled();
  });

  it("restores the chosen version, reports back and reloads the history", async () => {
    const { onRestored } = setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));

    expect(await screen.findByText("Version 1 is now the current entry, saved as version 3.")).toBeInTheDocument();
    expect(api.restoreEntryVersion).toHaveBeenCalledWith("e1", 1);
    expect(onRestored).toHaveBeenCalledWith(restored.entry);
    expect(api.fetchEntryHistory).toHaveBeenCalledTimes(2);
    expect(versionButton(3)).toHaveAttribute("aria-current", "true");
  });

  it("warns when values of since-deleted fields couldn't come back", async () => {
    vi.mocked(api.restoreEntryVersion).mockResolvedValue({ ...restored, skippedFields: 2 } as never);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));

    expect(await screen.findByText(/2 fields have since been deleted/i)).toBeInTheDocument();
  });

  it("uses the singular for one skipped field", async () => {
    vi.mocked(api.restoreEntryVersion).mockResolvedValue({ ...restored, skippedFields: 1 } as never);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));

    expect(await screen.findByText(/1 field has since been deleted.*its value could not come back/i)).toBeInTheDocument();
  });

  it("says so when the restore fails, leaving the history in place", async () => {
    vi.mocked(api.restoreEntryVersion).mockRejectedValue(new Error("500"));
    const { onRestored } = setup();
    fireEvent.click(await screen.findByRole("button", { name: /^Version 1(?!\d)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));

    expect(await screen.findByText(/couldn't restore that version/i)).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Versions" })).toBeInTheDocument();
  });
});

describe("EntryHistoryModal — viewing the entry as of a date", () => {
  const pickDate = async (date: string) => {
    fireEvent.change(await screen.findByLabelText(/see this entry as it was on/i), { target: { value: date } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
  };

  it("asks for the end of the chosen day and selects the version from then", async () => {
    vi.mocked(api.fetchEntryAtDate).mockResolvedValue({
      existed: true,
      entryCreatedAt: twoVersions.entryCreatedAt,
      version: twoVersions.versions[0],
      isCurrent: false,
    });
    setup();
    await pickDate("2026-09-01");

    expect(await screen.findByText(/this entry was at version 1\.$/)).toBeInTheDocument();
    const asked = vi.mocked(api.fetchEntryAtDate).mock.calls[0][1];
    expect(asked.getTime()).toBe(new Date("2026-09-01T23:59:59.999").getTime());
    expect(versionButton(1)).toHaveAttribute("aria-current", "true");
  });

  it("points out when the version from then is still the current one", async () => {
    vi.mocked(api.fetchEntryAtDate).mockResolvedValue({
      existed: true,
      entryCreatedAt: twoVersions.entryCreatedAt,
      version: twoVersions.versions[1],
      isCurrent: true,
    });
    setup();
    await pickDate("2026-09-05");
    expect(await screen.findByText(/which is still the current version/i)).toBeInTheDocument();
  });

  it("explains when the entry didn't exist yet on that date", async () => {
    vi.mocked(api.fetchEntryAtDate).mockResolvedValue({ existed: false, entryCreatedAt: twoVersions.entryCreatedAt });
    setup();
    await pickDate("2026-08-01");
    expect(await screen.findByText(/did not exist yet on/i)).toBeInTheDocument();
    expect(versionButton(2)).toHaveAttribute("aria-current", "true");
  });

  it("says so when the lookup fails", async () => {
    vi.mocked(api.fetchEntryAtDate).mockRejectedValue(new Error("offline"));
    setup();
    await pickDate("2026-09-01");
    expect(await screen.findByText(/couldn't look up that date/i)).toBeInTheDocument();
  });
});

describe("EntryHistoryModal — closing", () => {
  it("closes from the dialog's close button", async () => {
    const { onClose } = setup();
    await screen.findByRole("list", { name: "Versions" });
    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
