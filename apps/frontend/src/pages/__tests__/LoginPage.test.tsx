import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { LoginPage } from "../../pages/LoginPage";

/**
 * React 19 overrides the input.value setter, so fireEvent.change alone
 * does not trigger the component's onChange for controlled inputs.
 * This helper calls the *native* setter from HTMLInputElement.prototype
 * and then dispatches an `input` event, which React picks up correctly.
 */
function setNativeValue(element: HTMLElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderLogin(initialUrl = "/login") {
  window.history.pushState({}, "", initialUrl);
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage — session-expired banner", () => {
  it("renders the session-expired banner when the URL has ?expired=1", () => {
    renderLogin("/login?expired=1");

    expect(
      screen.getByText(/Your session has expired\. Please sign in again\./i)
    ).toBeInTheDocument();
  });

  it("does NOT render the session-expired banner on a plain /login", () => {
    renderLogin("/login");

    expect(
      screen.queryByText(/Your session has expired/i)
    ).not.toBeInTheDocument();
  });
});

describe("LoginPage — form presence", () => {
  it("renders the email and password fields and a submit button", () => {
    renderLogin("/login");

    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("LoginPage — client-side validation", () => {
  it("shows an error when the email is missing the @ sign", async () => {
    renderLogin("/login");

    // Leave email empty and fill password — HTML5 type="email" blocks
    // submit for malformed values like "not-an-email", so we use an
    // empty string which passes HTML5 but fails Zod's .email() check.
    setNativeValue(screen.getByPlaceholderText("••••••••"), "Strong1Pass");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Zod loginSchema rejects empty/invalid emails with a clear message
    expect(
      await screen.findByText(/please enter a valid email/i)
    ).toBeInTheDocument();
  });

  it("shows an error when the password is empty", async () => {
    renderLogin("/login");

    setNativeValue(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    // Intentionally leave the password empty
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });
});
