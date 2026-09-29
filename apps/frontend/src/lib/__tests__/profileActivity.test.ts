import { describe, it, expect } from "vitest";
import {
  dayKey,
  entryDay,
  summariseActivity,
  activityLevel,
  buildHeatmap,
  topTags,
  formatDuration,
  type ActivityEntry,
} from "../profileActivity";

/** A minimal entry; every field the module reads, nothing it doesn't. */
function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "p1",
    durationMinutes: 30,
    entryDate: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    tags: [],
    status: "DONE",
    ...over,
  };
}

/** Local midnight, so these tests read the same in every timezone. */
function localDay(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

describe("dayKey", () => {
  it("pads month and day", () => {
    expect(dayKey(localDay(2026, 3, 7))).toBe("2026-03-07");
  });

  it("uses the local calendar day, not the UTC one", () => {
    // 23:30 local on the 20th is the 20th, whatever UTC calls it.
    const lateEvening = new Date(2026, 8, 20, 23, 30, 0);
    expect(dayKey(lateEvening)).toBe("2026-09-20");
  });
});

describe("entryDay", () => {
  it("prefers entryDate when the student set one", () => {
    const backdated = entry({
      entryDate: new Date(2026, 5, 1, 9).toISOString(),
      createdAt: new Date(2026, 8, 20, 9).toISOString(),
    });
    expect(entryDay(backdated)).toBe("2026-06-01");
  });

  it("falls back to creation time when there is no entryDate", () => {
    expect(entryDay(entry({ createdAt: new Date(2026, 8, 20, 9).toISOString() }))).toBe("2026-09-20");
  });
});

describe("summariseActivity", () => {
  it("counts entries, minutes and distinct days", () => {
    const summary = summariseActivity([
      entry({ createdAt: new Date(2026, 8, 20, 9).toISOString(), durationMinutes: 30 }),
      entry({ createdAt: new Date(2026, 8, 20, 14).toISOString(), durationMinutes: 45 }),
      entry({ createdAt: new Date(2026, 8, 21, 9).toISOString(), durationMinutes: 60 }),
    ]);
    expect(summary.totalEntries).toBe(3);
    expect(summary.totalMinutes).toBe(135);
    expect(summary.activeDays).toBe(2);
  });

  it("treats a missing duration as zero rather than NaN", () => {
    const summary = summariseActivity([
      entry({ durationMinutes: undefined as unknown as number }),
      entry({ durationMinutes: 20 }),
    ]);
    expect(summary.totalMinutes).toBe(20);
  });

  it("is empty, not broken, with no entries at all", () => {
    const summary = summariseActivity([], localDay(2026, 9, 29));
    expect(summary).toMatchObject({
      totalEntries: 0,
      totalMinutes: 0,
      activeDays: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });
});

describe("current streak", () => {
  const today = localDay(2026, 9, 29);
  const on = (month: number, day: number) => entry({ createdAt: new Date(2026, month - 1, day, 9).toISOString() });

  it("counts consecutive days ending today", () => {
    const summary = summariseActivity([on(9, 29), on(9, 28), on(9, 27)], today);
    expect(summary.currentStreak).toBe(3);
  });

  it("still counts when today has nothing logged yet", () => {
    // The day is not over — a streak ending yesterday is still alive.
    const summary = summariseActivity([on(9, 28), on(9, 27)], today);
    expect(summary.currentStreak).toBe(2);
  });

  it("is broken by a full missed day", () => {
    const summary = summariseActivity([on(9, 27), on(9, 26)], today);
    expect(summary.currentStreak).toBe(0);
  });

  it("does not double-count two entries on the same day", () => {
    const summary = summariseActivity([on(9, 29), on(9, 29), on(9, 28)], today);
    expect(summary.currentStreak).toBe(2);
  });
});

describe("longest streak", () => {
  it("finds the best run, not the most recent one", () => {
    const days = [1, 2, 3, 4, 5, 20, 21].map((d) =>
      entry({ createdAt: new Date(2026, 8, d, 9).toISOString() })
    );
    expect(summariseActivity(days, localDay(2026, 9, 29)).longestStreak).toBe(5);
  });

  it("counts across a month boundary", () => {
    const days = [
      entry({ createdAt: new Date(2026, 7, 30, 9).toISOString() }),
      entry({ createdAt: new Date(2026, 7, 31, 9).toISOString() }),
      entry({ createdAt: new Date(2026, 8, 1, 9).toISOString() }),
    ];
    expect(summariseActivity(days, localDay(2026, 9, 29)).longestStreak).toBe(3);
  });
});

describe("activityLevel", () => {
  it("maps counts onto the five bands", () => {
    expect([0, 1, 2, 3, 4, 9].map(activityLevel)).toEqual([0, 1, 2, 3, 3, 4]);
  });

  it("never returns a band for a negative count", () => {
    expect(activityLevel(-1)).toBe(0);
  });
});

describe("buildHeatmap", () => {
  const today = localDay(2026, 9, 29); // a Tuesday

  it("returns whole weeks of seven days", () => {
    const grid = buildHeatmap(new Map(), today, 26);
    expect(grid).toHaveLength(26);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("ends on the Saturday of the current week", () => {
    const grid = buildHeatmap(new Map(), today, 4);
    expect(grid[grid.length - 1][6].date).toBe("2026-10-03");
  });

  it("marks days after today as future", () => {
    const grid = buildHeatmap(new Map(), today, 4);
    const lastWeek = grid[grid.length - 1];
    const todayCell = lastWeek.find((c) => c.date === "2026-09-29");
    const tomorrow = lastWeek.find((c) => c.date === "2026-09-30");
    expect(todayCell?.future).toBe(false);
    expect(tomorrow?.future).toBe(true);
  });

  it("colours a day by how many entries it holds", () => {
    const grid = buildHeatmap(new Map([["2026-09-28", 5]]), today, 4);
    const busy = grid.flat().find((c) => c.date === "2026-09-28");
    expect(busy).toMatchObject({ count: 5, level: 4 });
  });

  it("leaves a day outside the window out of the grid", () => {
    const grid = buildHeatmap(new Map([["2020-01-01", 3]]), today, 4);
    expect(grid.flat().some((c) => c.date === "2020-01-01")).toBe(false);
  });
});

describe("topTags", () => {
  it("ranks by use, breaking ties alphabetically", () => {
    const entries = [
      entry({ tags: ["lab", "report"] }),
      entry({ tags: ["lab"] }),
      entry({ tags: ["report"] }),
      entry({ tags: ["admin"] }),
    ];
    expect(topTags(entries)).toEqual([
      { name: "lab", count: 2 },
      { name: "report", count: 2 },
      { name: "admin", count: 1 },
    ]);
  });

  it("honours the limit", () => {
    const entries = [entry({ tags: ["a", "b", "c", "d"] })];
    expect(topTags(entries, 2)).toHaveLength(2);
  });

  it("copes with an entry that has no tags array at all", () => {
    const entries = [entry({ tags: undefined as unknown as string[] }), entry({ tags: ["x"] })];
    expect(topTags(entries)).toEqual([{ name: "x", count: 1 }]);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(270)).toBe("4h 30m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
  });

  it("shows nothing logged as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(NaN)).toBe("0m");
  });
});
