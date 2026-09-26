// Vitest global setup for frontend component tests
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library gives findBy*/waitFor one second by default. Under a full
// coverage run twenty jsdom files share the machine, and an assertion behind
// a second async round trip (projects, then entries) has been measured past
// that second for queueing rather than for anything wrong with the code —
// the same reasoning the backend's vitest config applies to its suites.
configure({ asyncUtilTimeout: 5000 });

// Clear localStorage between tests so no state leaks across suites.
afterEach(() => {
  localStorage.clear();
  // Reset the URL to a clean state between tests (the 401 interceptor
  // mutates window.location.href to redirect to /login).
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});
