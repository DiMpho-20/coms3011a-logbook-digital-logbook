import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({
  exportLogbook: vi.fn(),
  fetchDueReminders: vi.fn().mockResolvedValue([]),
  fetchEntries: vi.fn().mockResolvedValue([]),
  fetchEntryFields: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn().mockResolvedValue([]),
  importLogbook: vi.fn(),
}));
vi.mock("../../api/client", () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("../../lib/reminderNotifications", () => ({
  disableReminderNotifications: vi.fn(),
  enableReminderNotifications: vi.fn(),
  notificationsSupported: vi.fn(() => false),
  reminderNotificationMode: vi.fn(() => null),
}));

import * as data from "../../api";
import { api } from "../../api/client";
import SettingsPage from "../SettingsPage";

const renderAt = (section?: string) =>
  render(
    <MemoryRouter initialEntries={[section ? `/settings?section=${section}` : "/settings"]}>
      <SettingsPage />
    </MemoryRouter>
  );

/** The pane for the section currently open. */
const pane = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("logbook-name", "Dineo");
  localStorage.setItem("logbook-email", "dineo@example.com");
  vi.mocked(api.get).mockImplementation(((url: string) =>
    Promise.resolve({
      data: url === "/auth/2fa/status" ? { isTwoFactorEnabled: false, recoveryCodesRemaining: 0 } : { isEmailVerified: true },
    })) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsPage — account", () => {
  it("saves a new display name to the account", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { fullName: "Dineo M" } } as never);
    renderAt();

    const name = screen.getByDisplayValue("Dineo");
    fireEvent.change(name, { target: { value: "Dineo M" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/me", { fullName: "Dineo M" }));
    expect(await screen.findByRole("button", { name: /Saved/ })).toBeInTheDocument();
    expect(localStorage.getItem("logbook-name")).toBe("Dineo M");
  });

  it("refuses an empty name", async () => {
    renderAt();
    fireEvent.change(screen.getByDisplayValue("Dineo"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    expect(await screen.findByText("Display name cannot be empty.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("emails a password reset link instead of changing it in place", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} } as never);
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Email me a reset link/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "dineo@example.com" }));
    expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
  });

  it("schedules the account for deletion with the password", async () => {
    vi.mocked(api.delete).mockRejectedValueOnce({ response: { data: { error: "Incorrect password" } } });
    renderAt();
    fireEvent.change(screen.getAllByPlaceholderText("Confirm your password")[0], { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/auth/account", { data: { confirmPassword: "wrong" } }));
    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
  });
});

describe("SettingsPage — finding a setting", () => {
  it("searches by what people type, jumps to the section and marks the match", async () => {
    renderAt();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), { target: { value: "density" } });

    expect(await screen.findByRole("status")).toHaveTextContent("1 match in Appearance");
    const appearance = pane("Appearance");
    expect(within(appearance).getByText("Density", { selector: "mark" })).toBeInTheDocument();
    // Sections that can't match stay in the nav, dimmed rather than removed.
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    renderAt();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), { target: { value: "zzz" } });
    expect(await screen.findByText(/Nothing matches that/)).toBeInTheDocument();
  });

  it("opens a section from the nav", async () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: "Logbook" }));
    expect(await screen.findByRole("heading", { name: "Logbook Preferences" })).toBeInTheDocument();
  });
});

describe("SettingsPage — appearance", () => {
  it("keeps the theme, accent and density chosen", async () => {
    renderAt("appearance");
    fireEvent.click(within(pane("Appearance")).getByRole("button", { name: /Dark/ }));
    fireEvent.click(screen.getByRole("button", { name: "violet" }));
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));

    await waitFor(() => expect(localStorage.getItem("logbook-theme")).toBe(JSON.stringify("dark")));
    expect(localStorage.getItem("logbook-accent")).toBe(JSON.stringify("violet"));
    expect(localStorage.getItem("logbook-density")).toBe(JSON.stringify("compact"));
    expect(screen.getByRole("button", { name: "violet" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("SettingsPage — logbook preferences", () => {
  it("saves the week start the calendar reads", async () => {
    renderAt("logbook");
    const weekStart = within(pane("Logbook Preferences"))
      .getAllByRole("combobox")
      .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "sunday"))!;
    fireEvent.change(weekStart, { target: { value: "sunday" } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem("logbook-prefs")!).weekStartsOn).toBe("sunday"));
  });
});

describe("SettingsPage — security", () => {
  it("sets up two-factor sign-in and shows the recovery codes once", async () => {
    vi.mocked(api.post).mockImplementation(((url: string) =>
      Promise.resolve({
        data: url === "/auth/2fa/setup"
          ? { secret: "SECRET123", qrCodeUrl: "data:image/png;base64,AAAA" }
          : { recoveryCodes: ["aaaa-1111", "bbbb-2222"] },
      })) as never);
    renderAt("security");

    fireEvent.click(await screen.findByRole("button", { name: /Enable 2FA/ }));
    expect(await screen.findByText("SECRET123")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Enter 6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify & Enable/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/2fa/verify-setup", { token: "123456" }));
    expect(await screen.findByText("Save your recovery codes")).toBeInTheDocument();
    expect(screen.getByText("aaaa-1111")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I have saved them" }));
    expect(screen.queryByText("aaaa-1111")).toBeNull();
  });

  it("won't verify a code that isn't six digits", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { secret: "S", qrCodeUrl: "" } } as never);
    renderAt("security");
    fireEvent.click(await screen.findByRole("button", { name: /Enable 2FA/ }));
    fireEvent.change(await screen.findByPlaceholderText("Enter 6-digit code"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify & Enable/ }));
    expect(await screen.findByText("Please enter a valid 6-digit code")).toBeInTheDocument();
  });

  it("lists what still needs doing on the account", async () => {
    renderAt("security");
    const checklist = pane("Security");
    expect(await within(checklist).findByText("Your password alone is enough to sign in right now.")).toBeInTheDocument();
    expect(within(checklist).getByText("Password resets will reach you.")).toBeInTheDocument();
  });
});

describe("SettingsPage — notifications", () => {
  it("says when this browser can't show notifications, and links to the reminder rules", () => {
    renderAt("notifications");
    expect(screen.getByText("This browser can't show notifications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage reminder rules" })).toHaveAttribute("href", "/reminders");
  });
});

describe("SettingsPage — export, import and local data", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  it("exports the logbook as a JSON backup", async () => {
    vi.mocked(data.exportLogbook).mockResolvedValueOnce({ projects: [{}, {}] } as never);
    renderAt("export");
    fireEvent.click(screen.getByRole("button", { name: /JSON/ }));
    expect(await screen.findByText("Exported 2 projects.")).toBeInTheDocument();
  });

  it("exports every entry as CSV", async () => {
    vi.mocked(data.fetchProjects).mockResolvedValue([{ id: "p1", name: "Thesis" }] as never);
    vi.mocked(data.fetchEntries).mockResolvedValueOnce([{ id: "e1", values: {} }] as never);
    renderAt("export");
    fireEvent.click(screen.getByRole("button", { name: /CSV/ }));
    expect(await screen.findByText("Exported 1 entry as CSV.")).toBeInTheDocument();
  });

  it("explains a failed export", async () => {
    vi.mocked(data.exportLogbook).mockRejectedValueOnce(new Error("offline"));
    renderAt("export");
    fireEvent.click(screen.getByRole("button", { name: /JSON/ }));
    expect(await screen.findByText(/Export failed/)).toBeInTheDocument();
  });

  it("imports a backup file and says what came back", async () => {
    vi.mocked(data.importLogbook).mockResolvedValueOnce({ projects: 2, entries: 5 } as never);
    const { container } = renderAt("export");
    const file = new File([JSON.stringify({ version: 1, projects: [] })], "backup.json", { type: "application/json" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText("Imported 2 projects and 5 entries.")).toBeInTheDocument();
  });

  it("shows where data lives, and clears the browser's copy after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    localStorage.setItem("logbook-accent", JSON.stringify("violet"));
    renderAt("privacy");
    expect(screen.getByText("On the server")).toBeInTheDocument();
    expect(screen.getByText("In this browser only")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Clear$/ }));
    expect(localStorage.getItem("logbook-name")).toBeNull();
  });
});
