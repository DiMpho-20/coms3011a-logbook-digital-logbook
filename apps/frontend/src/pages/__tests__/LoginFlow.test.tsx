import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({ api: { post: vi.fn() } }));

import { api } from "../../api/client";
import { LoginPage } from "../LoginPage";

/** React 19 overrides the value setter, so set it natively and send an input event (as LoginPage.test does). */
function setNativeValue(element: HTMLElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderLogin(url = "/login") {
  window.history.pushState({}, "", url);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LoginPage />
    </MemoryRouter>
  );
}

function signIn(email = "student@example.com", password = "Password1") {
  setNativeValue(screen.getByPlaceholderText("name@example.com"), email);
  setNativeValue(screen.getByPlaceholderText("••••••••"), password);
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
}

const user = { fullName: "Dineo", email: "student@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LoginPage — signing in", () => {
  it("keeps the session and the name when the password is right", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: "jwt-1", user } } as never);
    renderLogin();
    signIn();

    await waitFor(() => expect(localStorage.getItem("token")).toBe("jwt-1"));
    expect(api.post).toHaveBeenCalledWith("/auth/login", { email: "student@example.com", password: "Password1" });
    expect(localStorage.getItem("logbook-name")).toBe("Dineo");
  });

  it("says the details are wrong without saying which", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: "Invalid email or password" } } });
    renderLogin();
    signIn();
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("LoginPage — two-factor sign-in", () => {
  const reachCodeStep = async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { requiresTwoFactor: true, twoFactorToken: "pending-1" } } as never);
    renderLogin();
    signIn();
    return screen.findByPlaceholderText("000000");
  };

  it("asks for the authenticator code after the password, and signs in with it", async () => {
    const code = await reachCodeStep();
    expect(localStorage.getItem("token")).toBeNull();

    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: "jwt-2", user } } as never);
    setNativeValue(code, "123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/auth/login/2fa", { twoFactorToken: "pending-1", code: "123456" })
    );
    await waitFor(() => expect(localStorage.getItem("token")).toBe("jwt-2"));
  });

  it("refuses a code that isn't six digits", async () => {
    const code = await reachCodeStep();
    setNativeValue(code, "12");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));
    expect(await screen.findByText("Please enter a valid 6-digit code")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("accepts a recovery code instead, and says how many are left", async () => {
    await reachCodeStep();
    fireEvent.click(screen.getByRole("button", { name: "Lost your device? Use a recovery code" }));
    const code = await screen.findByPlaceholderText("XXXXX-XXXXX");

    vi.mocked(api.post).mockResolvedValueOnce({
      data: { token: "jwt-3", user, usedRecoveryCode: true, recoveryCodesRemaining: 4 },
    } as never);
    setNativeValue(code, "ABCDE-12345");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));

    await waitFor(() => expect(localStorage.getItem("token")).toBe("jwt-3"));
    expect(localStorage.getItem("logbook-recovery-notice")).toBe("Recovery code used. You have 4 left.");
  });

  it("explains a code the server rejects", async () => {
    const code = await reachCodeStep();
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: "That code didn't work" } } });
    setNativeValue(code, "654321");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));
    expect(await screen.findByText("That code didn't work")).toBeInTheDocument();
  });
});

describe("LoginPage — an account scheduled for deletion", () => {
  const scheduled = { token: "jwt-4", user, scheduledDeletionAt: "2026-11-06T00:00:00.000Z" };

  it("offers to cancel the deletion before signing in", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: scheduled } as never)
      .mockResolvedValueOnce({ data: {} } as never);
    renderLogin();
    signIn();

    fireEvent.click(await screen.findByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/auth/account/cancel-deletion"));
    expect(localStorage.getItem("token")).toBe("jwt-4");
  });

  it("leaves the deletion in place, and the session closed, when kept", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: scheduled } as never);
    renderLogin();
    signIn();

    fireEvent.click(await screen.findByRole("button", { name: "Keep deletion" }));
    expect(screen.queryByRole("button", { name: "Cancel deletion" })).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("says when the deletion is due, arriving from Settings", () => {
    renderLogin("/login?deletionScheduled=2026-11-06T00:00:00.000Z");
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
