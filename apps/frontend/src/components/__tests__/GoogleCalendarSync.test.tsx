import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api/client", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

import { api } from "../../api/client";
import GoogleCalendarSync from "../GoogleCalendarSync";

const renderPanel = () => render(<MemoryRouter><GoogleCalendarSync /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe("GoogleCalendarSync", () => {
  it("says the check failed, not that the server isn't set up, and checks again", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network Error"));
    renderPanel();

    expect(await screen.findByText(/Couldn't check your Google Calendar connection/)).toBeInTheDocument();
    expect(screen.queryByText(/not set up on the server/)).toBeNull();

    vi.mocked(api.get).mockResolvedValueOnce({ data: { configured: true, connected: true, connectedAt: null } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });

  it("explains when the server has no Google Calendar set up", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { configured: false, connected: false, connectedAt: null } } as never);
    renderPanel();

    expect(await screen.findByText(/not set up on the server yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Google Calendar/ })).toBeDisabled();
  });

  it("reports what a sync changed", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { configured: true, connected: true, connectedAt: null } } as never);
    vi.mocked(api.post).mockResolvedValueOnce({ data: { created: 2, updated: 0, removed: 1 } } as never);
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("Synced: 2 added, 1 removed.")).toBeInTheDocument();
  });
});
