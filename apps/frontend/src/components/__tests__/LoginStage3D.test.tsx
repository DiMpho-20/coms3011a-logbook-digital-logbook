import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../../lib/motion", () => ({ prefersReducedMotion: vi.fn(() => false) }));

import { prefersReducedMotion } from "../../lib/motion";
import { LoginStage3D } from "../LoginStage3D";

const scene = () => document.querySelector(".login-scene") as HTMLElement;
const step = () => Number(scene().dataset.step);
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(prefersReducedMotion).mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginStage3D — the paging logbook", () => {
  it("still renders the sign-in card beside the book", () => {
    render(<LoginStage3D><p>Sign in form</p></LoginStage3D>);
    expect(screen.getByText("Sign in form")).toBeInTheDocument();
  });

  it("opens, turns a page per feature, then closes and starts again", () => {
    render(<LoginStage3D><p>card</p></LoginStage3D>);
    expect(step()).toBe(0);
    expect(scene()).not.toHaveClass("is-open");

    advance(2000);
    expect(step()).toBe(1);
    expect(scene()).toHaveClass("is-open");

    // Four features, one page each.
    for (let n = 2; n <= 5; n++) {
      advance(3800);
      expect(step()).toBe(n);
    }

    advance(3800);
    expect(step()).toBe(0);
    expect(scene()).toHaveClass("is-closing");

    advance(2000);
    expect(scene()).not.toHaveClass("is-closing");
    advance(2000);
    expect(step()).toBe(1);
  });

  it("turns the pages that have been read", () => {
    render(<LoginStage3D><p>card</p></LoginStage3D>);
    advance(2000);
    advance(3800);

    const pages = document.querySelectorAll<HTMLElement>(".login-page");
    expect(pages[0].style.transform).toContain("rotateY(-180deg)");
    expect(pages[1].style.transform).toContain("rotateY(0deg)");
  });

  it("holds the page while the pointer is over the book", () => {
    render(<LoginStage3D><p>card</p></LoginStage3D>);
    advance(2000);

    fireEvent.pointerEnter(document.querySelector(".login-book")!);
    advance(20_000);
    expect(step()).toBe(1);

    fireEvent.pointerLeave(document.querySelector(".login-book")!);
    advance(3800);
    expect(step()).toBe(2);
  });

  it("stays closed for viewers who ask for less motion", () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(true);
    render(<LoginStage3D><p>card</p></LoginStage3D>);

    advance(30_000);
    expect(step()).toBe(0);
  });
});
