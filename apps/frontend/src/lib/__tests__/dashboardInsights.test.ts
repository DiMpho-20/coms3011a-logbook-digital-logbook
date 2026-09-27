import { describe, it, expect } from "vitest";
import {
  entryStreaks,
  monthlyEntryCounts,
  recentWeeks,
  startOfWeek,
  summariseWeek,
  tagRanking,
  weeklyProgress,
} from "../dashboardInsights";
import { localDateKey } from "../utils";

// Wednesday 23 September 2026, local time. Its week starts Monday the 21st.
const TODAY = new Date(2026, 8, 23, 15, 0);

function entry(day: string, extra: { durationMinutes?: number; tags?: string[] } = {}) {
  return { entryDate: `${day}T00:00:00.000Z`, createdAt: `${day}T08:00:00.000Z`, ...extra };
}

describe("startOfWeek", () => {
  it("returns the Monday on or before the day", () => {
    expect(localDateKey(startOfWeek(TODAY))).toBe("2026-09-21");
    expect(localDateKey(startOfWeek(new Date(2026, 8, 21)))).toBe("2026-09-21");
    expect(localDateKey(startOfWeek(new Date(2026, 8, 27)))).toBe("2026-09-21"); // Sunday
  });
});

describe("entryStreaks", () => {
  it("counts the current run ending today and the longest run ever", () => {
    const entries = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-22", "2026-09-23"].map((d) => entry(d));
    expect(entryStreaks(entries, TODAY)).toEqual({ current: 2, longest: 4, loggedToday: true });
  });

  it("keeps a streak alive until the end of today", () => {
    const entries = [entry("2026-09-21"), entry("2026-09-22")];
    expect(entryStreaks(entries, TODAY)).toEqual({ current: 2, longest: 2, loggedToday: false });
  });

  it("counts several entries on one day once", () => {
    const entries = [entry("2026-09-23"), entry("2026-09-23"), entry("2026-09-23")];
    expect(entryStreaks(entries, TODAY)).toMatchObject({ current: 1, longest: 1 });
  });

  it("is zero with a gap before yesterday, or no entries", () => {
    expect(entryStreaks([entry("2026-09-20")], TODAY).current).toBe(0);
    expect(entryStreaks([], TODAY)).toEqual({ current: 0, longest: 0, loggedToday: false });
  });

  it("runs across a month boundary", () => {
    const entries = [entry("2026-08-30"), entry("2026-08-31"), entry("2026-09-01")];
    expect(entryStreaks(entries, TODAY).longest).toBe(3);
  });
});

describe("monthlyEntryCounts", () => {
  it("counts entries in each of the last six months, oldest first", () => {
    const entries = [entry("2026-09-01"), entry("2026-09-20"), entry("2026-07-15"), entry("2026-03-31"), entry("2025-09-01")];
    const months = monthlyEntryCounts(entries, 6, TODAY);
    expect(months.map((m) => m.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(months.map((m) => m.count)).toEqual([0, 0, 0, 1, 0, 2]);
  });

  it("reaches back into last year", () => {
    const months = monthlyEntryCounts([entry("2025-12-05")], 12, TODAY);
    expect(months[0].key).toBe("2025-10");
    expect(months.find((m) => m.key === "2025-12")?.count).toBe(1);
  });
});

describe("weeklyProgress", () => {
  it("counts each week and keeps a running total that includes older entries", () => {
    const entries = [
      entry("2026-01-10"), // before the window
      entry("2026-09-14", { durationMinutes: 30 }),
      entry("2026-09-21", { durationMinutes: 45 }),
      entry("2026-09-23", { durationMinutes: 15 }),
    ];
    const weeks = weeklyProgress(entries, 3, TODAY);
    expect(weeks.map((w) => w.key)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
    expect(weeks.map((w) => w.entries)).toEqual([0, 1, 2]);
    expect(weeks.map((w) => w.minutes)).toEqual([0, 30, 60]);
    expect(weeks.map((w) => w.total)).toEqual([1, 2, 4]);
  });
});

describe("tagRanking", () => {
  it("ranks tags by the number of entries using them", () => {
    const entries = [
      entry("2026-09-01", { tags: ["lab", "reading"] }),
      entry("2026-09-02", { tags: ["lab"] }),
      entry("2026-09-03", { tags: ["lab", "lab"] }), // a duplicate counts once
      entry("2026-09-04"),
    ];
    expect(tagRanking(entries)).toEqual([
      { name: "lab", entries: 3, percent: 75 },
      { name: "reading", entries: 1, percent: 25 },
    ]);
  });

  it("breaks ties alphabetically", () => {
    const entries = [entry("2026-09-01", { tags: ["zeta"] }), entry("2026-09-02", { tags: ["alpha"] })];
    expect(tagRanking(entries).map((t) => t.name)).toEqual(["alpha", "zeta"]);
  });
});

describe("week comparison", () => {
  it("lists recent weeks newest first", () => {
    const weeks = recentWeeks(3, TODAY);
    expect(weeks.map((w) => w.key)).toEqual(["2026-09-21", "2026-09-14", "2026-09-07"]);
    expect(weeks[0].label).toMatch(/^This week/);
    expect(weeks[1].label).toMatch(/^Last week/);
  });

  it("summarises one week's entries", () => {
    const entries = [
      entry("2026-09-14", { durationMinutes: 60, tags: ["lab"] }),
      entry("2026-09-14", { durationMinutes: 30, tags: ["lab", "essay"] }),
      entry("2026-09-20", { durationMinutes: 15, tags: ["essay"] }), // Sunday, same week
      entry("2026-09-21", { durationMinutes: 999, tags: ["other"] }), // next week
    ];
    expect(summariseWeek(entries, "2026-09-14")).toEqual({ entries: 3, minutes: 105, activeDays: 2, topTag: "essay" });
    expect(summariseWeek([], "2026-09-14")).toEqual({ entries: 0, minutes: 0, activeDays: 0, topTag: null });
  });
});
