import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../api/client", () => ({ api: { post: vi.fn() } }));

import { api } from "../../api/client";
import { ForgotPasswordPage } from "../ForgotPasswordPage";
import { ResetPasswordPage } from "../ResetPasswordPage";
import { VerifyEmail } from "../VerifyEmail";

/** These pages read their token from the address bar, as a link from an email would set it. */
const visit = (path: string) => window.history.pushState({}, "", path);

beforeEach(() => {
  vi.clearAllMocks();
  visit("/");
});

describe("ForgotPasswordPage", () => {
  const submit = (email: string) => {
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: email } });
    fireEvent.submit(screen.getByPlaceholderText("name@example.com").closest("form")!);
  };

  it("checks the address before asking the server", async () => {
    render(<ForgotPasswordPage />);
    submit("not-an-email");
    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("asks for a reset link and says what happened, whatever the address", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: "If that address has an account, a link is on its way." } });
    render(<ForgotPasswordPage />);
    submit("student@example.com");

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "student@example.com" }));
    expect(await screen.findByText("If that address has an account, a link is on its way.")).toBeInTheDocument();
  });

  it("offers the development-mode reset link when the server returns one", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: "Link generated.", mockResetToken: "tok-123" } });
    render(<ForgotPasswordPage />);
    submit("student@example.com");

    const link = await screen.findByRole("link", { name: /reset/i });
    expect(link).toHaveAttribute("href", "/reset-password?token=tok-123");
  });

  it("shows the server's reason when the request fails", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: "Too many requests" } } });
    render(<ForgotPasswordPage />);
    submit("student@example.com");
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });
});

describe("ResetPasswordPage", () => {
  const typePassword = (value: string) => {
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value } });
    fireEvent.submit(screen.getByPlaceholderText("••••••••").closest("form")!);
  };

  it("says the link is broken when it carries no token", async () => {
    render(<ResetPasswordPage />);
    expect(await screen.findByText(/Invalid or missing password reset link/)).toBeInTheDocument();
  });

  it("checks the new password before sending it", async () => {
    visit("/reset-password?token=tok-123");
    render(<ResetPasswordPage />);
    // Long enough and with a number, but no capital letter.
    typePassword("longenough1");
    expect(await screen.findByText("Password must contain at least one uppercase letter")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sends the token from the link with the new password", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: "Password successfully reset!" } });
    visit("/reset-password?token=tok-123");
    render(<ResetPasswordPage />);
    typePassword("A-much-better-passw0rd!");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/reset-password", { token: "tok-123", newPassword: "A-much-better-passw0rd!" })
    );
    expect(await screen.findByText("Password successfully reset!")).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: "This reset link has expired" } } });
    visit("/reset-password?token=old");
    render(<ResetPasswordPage />);
    typePassword("A-much-better-passw0rd!");
    expect(await screen.findByText("This reset link has expired")).toBeInTheDocument();
  });
});

describe("VerifyEmail", () => {
  it("says so when the link has no token", async () => {
    render(<VerifyEmail />);
    expect(await screen.findByText("No verification token found in link.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("verifies the address from the link once", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: "Email verified successfully! Redirecting..." } });
    visit("/verify-email?token=abc");
    render(<VerifyEmail />);

    expect(await screen.findByText("Email verified successfully! Redirecting...")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/verify-email", { token: "abc" });
  });

  it("explains an invalid or expired token", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: "Invalid or expired verification token" } } });
    visit("/verify-email?token=stale");
    render(<VerifyEmail />);
    expect(await screen.findByText("Invalid or expired verification token")).toBeInTheDocument();
  });
});
