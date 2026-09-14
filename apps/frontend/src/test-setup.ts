// Vitest global setup for frontend component tests
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Clear localStorage between tests so no state leaks across suites.
afterEach(() => {
  localStorage.clear();
  // Reset the URL to a clean state between tests (the 401 interceptor
  // mutates window.location.href to redirect to /login).
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});
