// Vitest global setup for frontend component tests
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library gives findBy*/waitFor one second by default. Under a full
// coverage run twenty-five jsdom files share the machine, and an assertion
// behind a second async round trip (projects, then entries) has been measured
// well past that for queueing rather than for anything wrong with the code —
// the same reasoning the backend's vitest config applies to its suites.
//
// Raised from 5s on 2026-09-27, when a CI coverage run failed two CalendarPage
// finds at the 5s ceiling. That run proved it was queueing and not the page:
// a third test in the same file ran the identical query
// — findByRole("button", { name: "10m" }) — against the same fixture and
// passed, and the case that failed was the simplest one, a single entry.
// The run reported 233s in environment setup alone across 25 files.
//
// This buys patience, not leniency: the assertions are unchanged, so a genuine
// failure still fails — it just takes longer to say so.
configure({ asyncUtilTimeout: 15_000 });

// Clear localStorage between tests so no state leaks across suites.
afterEach(() => {
  localStorage.clear();
  // Reset the URL to a clean state between tests (the 401 interceptor
  // mutates window.location.href to redirect to /login).
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});
