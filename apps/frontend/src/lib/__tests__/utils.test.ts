import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { localDateKey, todayISO, entryDateKey, computeStreak, formatDateHeading } from "../utils";

describe("localDateKey", () => {
  it("formats a date as YYYY-MM-DD using local calendar fields, not UTC", () => {
    // A time chosen so its UTC day differs from its local day in most
    // timezones east of UTC (this is exactly the class of entry that used
    // to land on the wrong day when the app read toISOString() instead).
    const d = new Date(2026, 0, 15, 23, 30); // Jan 15, 11:30pm, local time
    expect(localDateKey(d)).toBe("2026-01-15");
  });

  it("pads single-digit months and days", () => {
    const d = new Date(2026, 2, 5); // March 5 — month index 2, day 5
    expect(localDateKey(d)).toBe("2026-03-05");
  });
});

describe("todayISO", () => {
  it("matches localDateKey(new Date()), not toISOString()'s UTC day", () => {
    expect(todayISO()).toBe(localDateKey(new Date()));
  });
});

describe("entryDateKey", () => {
  it("uses the entry's own entryDate when set, sliced to the calendar day", () => {
    const entry = { entryDate: "2026-06-10T00:00:00.000Z", createdAt: "2026-06-11T23:00:00.000Z" };
    expect(entryDateKey(entry)).toBe("2026-06-10");
  });

  it("falls back to the local day of createdAt when entryDate is absent", () => {
    // A createdAt timestamp late enough in the day that naively slicing
    // toISOString() would put it on a different UTC day than its local one
    // in a timezone ahead of UTC — entryDateKey must use local time instead.
    const entry = { entryDate: null, createdAt: new Date(2026, 5, 10, 23, 45).toISOString() };
    expect(entryDateKey(entry)).toBe(localDateKey(new Date(entry.createdAt)));
  });
});

describe("formatDateHeading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 10, 0)); // Sep 20, 2026, local
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today's key as Today", () => {
    expect(formatDateHeading(todayISO())).toBe("Today");
  });

  it("labels yesterday's key as Yesterday", () => {
    expect(formatDateHeading("2026-09-19")).toBe("Yesterday");
  });

  it("does not mislabel a full ISO timestamp as neither Today nor Yesterday incorrectly", () => {
    // Regression: passing an un-sliced ISO string (the old entryDate bug)
    // must not accidentally match today's plain YYYY-MM-DD key.
    expect(formatDateHeading("2026-09-20T00:00:00.000Z")).not.toBe("Today");
  });
});

describe("computeStreak", () => {
  it("counts consecutive local days ending today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 23, 0)); // Sep 20, 11pm local
    try {
      const keys = new Set(["2026-09-20", "2026-09-19", "2026-09-18"]);
      expect(computeStreak(keys)).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still counts a streak ending yesterday if today has no entry yet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 8, 0));
    try {
      const keys = new Set(["2026-09-19", "2026-09-18"]);
      expect(computeStreak(keys)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 0 when neither today nor yesterday has an entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 8, 0));
    try {
      const keys = new Set(["2026-09-01"]);
      expect(computeStreak(keys)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
