import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Google Calendar due-date sync ────────────────────────────────────────
// A fake Calendar API stands in for Google so these tests exercise the sync
// rules (create / update / skip / remove) without network access.

type FakeEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const fake = {
  events: [] as FakeEvent[],
  list: vi.fn(),
  insert: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("googleapis/build/src/apis/calendar/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("googleapis/build/src/apis/calendar/index.js")>();
  return {
    ...actual,
    calendar: () => ({
      events: { list: fake.list, insert: fake.insert, patch: fake.patch, delete: fake.delete },
    }),
  };
});

const { syncDueDates, createGoogleCalendarClient } = await import("../services/googleCalendarService.js");
const prisma = (await import("../prisma.js")).default;

function entry(id: string, due: string, text = "Write report") {
  return {
    id,
    projectId: "p1",
    dueDate: new Date(`${due}T00:00:00.000Z`),
    project: { name: "Thesis" },
    values: [{ value: text, field: { type: "TEXT" } }],
  };
}

function tagged(id: string, entryId: string, extra: Partial<FakeEvent> = {}): FakeEvent {
  return {
    id,
    extendedProperties: { private: { logbookSource: "digital-logbook", logbookEntryId: entryId } },
    ...extra,
  };
}

beforeEach(() => {
  process.env.APP_URL = "http://app.test";
  fake.events = [];
  fake.list.mockImplementation(async () => ({ data: { items: fake.events } }));
  fake.insert.mockResolvedValue({ data: {} });
  fake.patch.mockResolvedValue({ data: {} });
  fake.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
  fake.list.mockReset();
  fake.insert.mockReset();
  fake.patch.mockReset();
  fake.delete.mockReset();
});

function withEntries(entries: ReturnType<typeof entry>[]) {
  return vi.spyOn(prisma.logbookEntry, "findMany").mockResolvedValue(entries as never);
}

describe("syncDueDates", () => {
  it("only queries the caller's open, dated, unarchived entries", async () => {
    const spy = withEntries([]);
    await syncDueDates("user-1", createGoogleCalendarClient());
    expect(spy.mock.calls[0][0]).toMatchObject({
      where: { project: { userId: "user-1" }, status: "OPEN", dueDate: { not: null }, archivedAt: null },
    });
  });

  it("creates an all-day, tagged event for a new due date", async () => {
    withEntries([entry("e1", "2026-10-01")]);
    const result = await syncDueDates("user-1", createGoogleCalendarClient());

    expect(result).toEqual({ created: 1, updated: 0, removed: 0 });
    const body = fake.insert.mock.calls[0][0].requestBody;
    expect(body.summary).toBe("Thesis — Write report");
    expect(body.start).toEqual({ date: "2026-10-01" });
    expect(body.end).toEqual({ date: "2026-10-02" });
    expect(body.extendedProperties.private).toEqual({ logbookSource: "digital-logbook", logbookEntryId: "e1" });
  });

  it("is idempotent: an unchanged event is left alone", async () => {
    withEntries([entry("e1", "2026-10-01")]);
    fake.events = [
      tagged("g1", "e1", {
        summary: "Thesis — Write report",
        description: "Due date from the Digital Logbook.\nhttp://app.test/projects/p1",
        start: { date: "2026-10-01" },
      }),
    ];
    const result = await syncDueDates("user-1", createGoogleCalendarClient());

    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.patch).not.toHaveBeenCalled();
  });

  it("updates an event whose due date moved", async () => {
    withEntries([entry("e1", "2026-10-05")]);
    fake.events = [tagged("g1", "e1", { summary: "Thesis — Write report", start: { date: "2026-10-01" } })];
    const result = await syncDueDates("user-1", createGoogleCalendarClient());

    expect(result).toEqual({ created: 0, updated: 1, removed: 0 });
    expect(fake.patch.mock.calls[0][0]).toMatchObject({ eventId: "g1", requestBody: { start: { date: "2026-10-05" } } });
  });

  it("removes events for entries that are done, undated or deleted, and duplicates", async () => {
    withEntries([entry("e1", "2026-10-01")]);
    fake.events = [
      tagged("g1", "e1", {
        summary: "Thesis — Write report",
        description: "Due date from the Digital Logbook.\nhttp://app.test/projects/p1",
        start: { date: "2026-10-01" },
      }),
      tagged("g1-dup", "e1"),
      tagged("g2", "gone"),
    ];
    const result = await syncDueDates("user-1", createGoogleCalendarClient());

    expect(result).toEqual({ created: 0, updated: 0, removed: 2 });
    expect(fake.delete.mock.calls.map((c) => c[0].eventId).sort()).toEqual(["g1-dup", "g2"]);
  });

  it("treats an event already deleted on Google as removed", async () => {
    withEntries([]);
    fake.events = [tagged("g2", "gone")];
    fake.delete.mockRejectedValue(Object.assign(new Error("Gone"), { code: 410 }));
    await expect(syncDueDates("user-1", createGoogleCalendarClient())).resolves.toEqual({
      created: 0,
      updated: 0,
      removed: 1,
    });
  });

  it("only lists events the logbook created", async () => {
    withEntries([]);
    await syncDueDates("user-1", createGoogleCalendarClient());
    expect(fake.list.mock.calls[0][0]).toMatchObject({
      calendarId: "primary",
      privateExtendedProperty: ["logbookSource=digital-logbook"],
    });
  });
});
