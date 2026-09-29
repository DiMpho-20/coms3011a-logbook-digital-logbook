import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  forgetProject,
  isQuickCaptureKey,
  isSaveShortcut,
  lastProjectId,
  rememberProject,
} from "../quickCapture";

const press = (key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, ...init });
  Object.defineProperty(e, "target", { value: target });
  return e;
};

beforeEach(() => localStorage.clear());
afterEach(() => document.body.replaceChildren());

describe("the N shortcut", () => {
  it("fires on N, in either case, when nothing is being typed", () => {
    expect(isQuickCaptureKey(press("n"))).toBe(true);
    expect(isQuickCaptureKey(press("N"))).toBe(true);
  });

  it("ignores other keys", () => {
    expect(isQuickCaptureKey(press("m"))).toBe(false);
  });

  it("leaves N alone while typing in a field", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isQuickCaptureKey(press("n", document.createElement(tag)))).toBe(false);
    }
  });

  it("leaves Ctrl/Cmd/Alt+N to the browser and ignores a held key", () => {
    expect(isQuickCaptureKey(press("n", document.body, { ctrlKey: true }))).toBe(false);
    expect(isQuickCaptureKey(press("n", document.body, { metaKey: true }))).toBe(false);
    expect(isQuickCaptureKey(press("n", document.body, { altKey: true }))).toBe(false);
    expect(isQuickCaptureKey(press("n", document.body, { repeat: true }))).toBe(false);
  });

  it("does nothing while a dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    expect(isQuickCaptureKey(press("n"))).toBe(false);
  });
});

describe("the save shortcut", () => {
  it("is Ctrl+Enter or Cmd+Enter", () => {
    expect(isSaveShortcut({ key: "Enter", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSaveShortcut({ key: "Enter", ctrlKey: false, metaKey: true })).toBe(true);
  });

  it("is not a plain Enter, which adds a line or a tag", () => {
    expect(isSaveShortcut({ key: "Enter", ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe("the remembered project", () => {
  it("is empty until a project is opened", () => {
    expect(lastProjectId()).toBeNull();
  });

  it("is the last project opened", () => {
    rememberProject("p1");
    rememberProject("p2");
    expect(lastProjectId()).toBe("p2");
  });

  it("is forgotten when that project stops loading, but not for another", () => {
    rememberProject("p1");
    forgetProject("p2");
    expect(lastProjectId()).toBe("p1");
    forgetProject("p1");
    expect(lastProjectId()).toBeNull();
  });
});
