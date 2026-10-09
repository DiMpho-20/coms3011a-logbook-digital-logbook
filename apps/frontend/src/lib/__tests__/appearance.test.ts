import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyTheme, restoreAppearance } from "../appearance";

let osDark = false;
const listeners: Array<() => void> = [];

vi.stubGlobal("matchMedia", (query: string) => ({
  media: query,
  get matches() {
    return osDark;
  },
  addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  removeEventListener: () => {},
}));

const theme = () => document.documentElement.getAttribute("data-theme");

describe("appearance", () => {
  beforeEach(() => {
    osDark = false;
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("follows the operating system when the theme is System", () => {
    osDark = true;
    applyTheme("system");
    expect(theme()).toBe("dark");
  });

  it("keeps following it when the system setting changes while the app is open", () => {
    applyTheme("system");
    expect(theme()).toBeNull();
    osDark = true;
    listeners.forEach((fn) => fn());
    expect(theme()).toBe("dark");
  });

  it("lets an explicit choice win over the system", () => {
    osDark = true;
    applyTheme("light");
    expect(theme()).toBeNull();
    listeners.forEach((fn) => fn());
    expect(theme()).toBeNull();
    osDark = false;
    applyTheme("dark");
    expect(theme()).toBe("dark");
  });

  it("defaults to light when nothing is saved, even if the operating system is dark", () => {
    osDark = true;
    restoreAppearance();
    expect(theme()).toBeNull();
  });

  it("clears a theme saved before the light default exactly once", () => {
    localStorage.setItem("logbook-theme", JSON.stringify("dark"));
    restoreAppearance();
    expect(theme()).toBeNull();
    expect(localStorage.getItem("logbook-theme")).toBeNull();
    expect(localStorage.getItem("logbook-theme-migrated")).toBe("true");
  });

  it("respects choices saved after the migration", () => {
    localStorage.setItem("logbook-theme-migrated", JSON.stringify(true));
    localStorage.setItem("logbook-theme", JSON.stringify("dark"));
    restoreAppearance();
    expect(theme()).toBe("dark");
  });

  it("restores saved choices on start-up and ignores anything unexpected", () => {
    localStorage.setItem("logbook-theme-migrated", JSON.stringify(true));
    localStorage.setItem("logbook-theme", JSON.stringify("dark"));
    localStorage.setItem("logbook-accent", JSON.stringify("violet"));
    localStorage.setItem("logbook-density", JSON.stringify("compact"));
    restoreAppearance();
    expect(theme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");

    localStorage.setItem("logbook-theme", "not json");
    localStorage.setItem("logbook-accent", JSON.stringify("purple"));
    restoreAppearance();
    expect(theme()).toBeNull();
    expect(document.documentElement.getAttribute("data-accent")).toBe("blue");
  });
});
