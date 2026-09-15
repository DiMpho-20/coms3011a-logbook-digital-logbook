import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { RegisterPage } from "../../pages/RegisterPage";

// Mock the api client so registration calls don't hit the network
vi.mock("../../api/client", () => {
  const postFn = vi.fn().mockRejectedValue({
    response: { data: { error: "Network mocked" } },
  });
  return { api: { post: postFn, defaults: { headers: { common: {} } } } };
});

/**
 * React 19 controlled-input helper — calls the native value setter
 * so React's onChange picks up the change in jsdom.
 */
function setNativeValue(element: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderRegister(url = "/register") {
  window.history.pushState({}, "", url);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RegisterPage />
    </MemoryRouter>,
  );
}

describe("RegisterPage — form presence", () => {
  it("renders full name, email, and password fields", () => {
    renderRegister();
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("renders a Create Account submit button", () => {
    renderRegister();
    expect(
      screen.getByRole("button", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("renders a link to sign in for existing users", () => {
    renderRegister();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("RegisterPage — client-side validation", () => {
  it("shows an error when full name is too short", async () => {
    renderRegister();

    setNativeValue(screen.getByPlaceholderText("John Doe"), "A");
    setNativeValue(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    setNativeValue(screen.getByPlaceholderText("••••••••"), "Strong1Pass");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/at least 2 characters/i),
    ).toBeInTheDocument();
  });

  it("shows an error when password is too short", async () => {
    renderRegister();

    setNativeValue(screen.getByPlaceholderText("John Doe"), "Test User");
    setNativeValue(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    // "Ab1" has uppercase + number but is only 3 chars — triggers the .min(8) error
    setNativeValue(screen.getByPlaceholderText("••••••••"), "Ab1");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/at least 8 characters/i),
    ).toBeInTheDocument();
  });

  it("shows an error when email is invalid", async () => {
    renderRegister();

    setNativeValue(screen.getByPlaceholderText("John Doe"), "Test User");
    // Leave email empty — passes HTML5 type="email" but fails Zod .email()
    setNativeValue(screen.getByPlaceholderText("••••••••"), "Strong1Pass");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/please enter a valid email/i),
    ).toBeInTheDocument();
  });

  it("shows an error when password lacks an uppercase letter", async () => {
    renderRegister();

    setNativeValue(screen.getByPlaceholderText("John Doe"), "Test User");
    setNativeValue(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    setNativeValue(screen.getByPlaceholderText("••••••••"), "lowercase1");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/uppercase/i),
    ).toBeInTheDocument();
  });
});
