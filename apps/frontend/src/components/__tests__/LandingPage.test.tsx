import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../LandingPage";

const renderLanding = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

describe("LandingPage", () => {
  it("says what the product is in one heading", () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("leads a visitor to sign up, sign in or straight to the app", () => {
    renderLanding();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/register");
    expect(hrefs).toContain("/login");
    expect(hrefs).toContain("/dashboard");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("follows the pointer without breaking when it moves over the page", () => {
    const { container } = renderLanding();
    // The tilt effects respond to pointer movement; this only checks they cope with it.
    for (const element of Array.from(container.querySelectorAll("*")).slice(0, 40)) {
      fireEvent.pointerMove(element, { clientX: 120, clientY: 80 });
      fireEvent.pointerLeave(element);
    }
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
