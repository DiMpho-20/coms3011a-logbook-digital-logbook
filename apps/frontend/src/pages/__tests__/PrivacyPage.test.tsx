import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrivacyPage from "../PrivacyPage";

describe("PrivacyPage", () => {
  it("is readable without signing in and explains the Google Calendar access", () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeInTheDocument();
    expect(screen.getByText(/only reads and changes events it created itself/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /User Data Policy/ })).toHaveAttribute(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy"
    );
  });
});
