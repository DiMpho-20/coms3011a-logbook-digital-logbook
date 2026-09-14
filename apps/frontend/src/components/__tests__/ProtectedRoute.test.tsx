import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { ProtectedRoute } from "../../components/ProtectedRoute";

function renderProtected(token: string | null) {
  if (token !== null) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }

  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/login"
          element={<div data-testid="login-page">Login Page</div>}
        />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/protected"
            element={<div data-testid="protected-content">Protected Content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when no token is stored", () => {
    renderProtected(null);

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("renders children when a token is present", () => {
    renderProtected("some-jwt-token");

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("renders wrapped children directly when passed via the children prop", () => {
    localStorage.setItem("token", "some-jwt-token");
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="wrapped">Wrapped content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByTestId("wrapped")).toBeInTheDocument();
  });
});
