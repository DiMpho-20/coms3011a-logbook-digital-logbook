import { describe, it, expect } from "vitest";
import { ENCOURAGEMENTS, dailyEncouragement } from "../encouragement";

describe("daily encouragement", () => {
  it("keeps the same message all day, and changes it the next day", () => {
    const morning = dailyEncouragement(new Date(2026, 9, 6, 6, 0));
    const night = dailyEncouragement(new Date(2026, 9, 6, 23, 59));
    const tomorrow = dailyEncouragement(new Date(2026, 9, 7, 9, 0));
    expect(morning).toBe(night);
    expect(tomorrow).not.toBe(morning);
  });

  it("goes through every message before repeating", () => {
    const seen = new Set<string>();
    for (let i = 0; i < ENCOURAGEMENTS.length; i++) seen.add(dailyEncouragement(new Date(2026, 0, 1 + i, 12)));
    expect(seen.size).toBe(ENCOURAGEMENTS.length);
  });

  it("has a curated pool in a calm voice", () => {
    expect(ENCOURAGEMENTS.length).toBeGreaterThanOrEqual(60);
    expect(ENCOURAGEMENTS.length).toBeLessThanOrEqual(90);
    expect(new Set(ENCOURAGEMENTS).size).toBe(ENCOURAGEMENTS.length);
    for (const message of ENCOURAGEMENTS) expect(message).not.toMatch(/!/);
  });
});
