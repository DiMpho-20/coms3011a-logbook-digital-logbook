import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

import { api } from "../client";

/**
 * Build a mock adapter that returns a rejected promise shaped like an axios
 * error with the given status. axios treats any rejected promise from the
 * adapter as a response-error and routes it through the response interceptor,
 * which is exactly the code path we want to exercise.
 */
function mockAdapter(status: number): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject({
      config,
      isAxiosError: true,
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "",
        data: {},
        headers: {},
        config,
      },
    });
}

// Replace window.location once at file scope so we can capture redirect
// attempts without the `delete window.location` leaking between tests.
let capturedHref: string | undefined;
const originalLocation = window.location;

beforeEach(() => {
  // Pre-seed a valid session so the tests can verify the interceptor clears it
  localStorage.setItem("token", "expired-jwt-token");
  localStorage.setItem("logbook-name", "Test User");
  localStorage.setItem("logbook-email", "test@example.com");
  localStorage.setItem("logbook-avatar", "avatar-data");

  // Reset redirect capture and pathname for each test
  capturedHref = undefined;
  delete (window as { location?: Location }).location;
  (window as { location: Partial<Location> }).location = {
    ...originalLocation,
    pathname: "/",
    search: "",
    get href() { return "http://localhost/"; },
    set href(v: string) { capturedHref = v; },
    assign: (url: string) => { capturedHref = url; },
    reload: () => {},
  };
});

afterEach(() => {
  // Restore original location so the global test-setup pushState works
  delete (window as { location?: Location }).location;
  (window as { location: Location }).location = originalLocation;
});

describe("401 response interceptor — protected routes", () => {
  it("clears the session and redirects to /login?expired=1 when /projects returns 401", async () => {
    api.defaults.adapter = mockAdapter(401);

    await expect(api.get("/projects")).rejects.toBeDefined();

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("logbook-name")).toBeNull();
    expect(localStorage.getItem("logbook-email")).toBeNull();
    expect(localStorage.getItem("logbook-avatar")).toBeNull();
    expect(capturedHref).toBe("/login?expired=1");
  });

  it("does NOT redirect if already on the /login page", async () => {
    // Simulate the user already sitting on /login
    (window.location as Partial<Location>).pathname = "/login";

    api.defaults.adapter = mockAdapter(401);

    await expect(api.get("/projects")).rejects.toBeDefined();

    // Session is still cleared, but no navigation happens (avoids loop)
    expect(localStorage.getItem("token")).toBeNull();
    expect(capturedHref).toBeUndefined();
  });
});

describe("401 response interceptor — credential routes (excluded)", () => {
  // These endpoints legitimately return 401 for wrong password/code;
  // the interceptor must NOT clear the session on those.
  for (const route of [
    "/auth/login",
    "/auth/login/2fa",
    "/auth/account",
    "/auth/2fa/disable",
  ]) {
    it(`leaves the session intact for 401 on ${route}`, async () => {
      api.defaults.adapter = mockAdapter(401);

      await expect(api.post(route, {})).rejects.toBeDefined();

      expect(localStorage.getItem("token")).toBe("expired-jwt-token");
      expect(localStorage.getItem("logbook-name")).toBe("Test User");
      // No redirect either
      expect(window.location.pathname).toBe("/");
    });
  }
});

describe("non-401 errors", () => {
  it("does not clear the session or redirect on 500 errors", async () => {
    api.defaults.adapter = mockAdapter(500);

    await expect(api.get("/projects")).rejects.toBeDefined();

    expect(localStorage.getItem("token")).toBe("expired-jwt-token");
    expect(window.location.pathname).toBe("/");
  });

  it("does not clear the session or redirect on 404 errors", async () => {
    api.defaults.adapter = mockAdapter(404);

    await expect(api.get("/entries/unknown")).rejects.toBeDefined();

    expect(localStorage.getItem("token")).toBe("expired-jwt-token");
    expect(window.location.pathname).toBe("/");
  });
});

describe("request interceptor — token attachment", () => {
  it("attaches the stored token to outgoing requests", async () => {
    let capturedAuth: string | undefined;
    api.defaults.adapter = (config) => {
      capturedAuth = config.headers.Authorization as string | undefined;
      // Return a successful minimal response to resolve cleanly
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    };

    await api.get("/projects");
    expect(capturedAuth).toBe("Bearer expired-jwt-token");
  });

  it("omits the Authorization header when no token is stored", async () => {
    localStorage.removeItem("token");
    let capturedAuth: string | undefined = "initial";
    api.defaults.adapter = (config) => {
      capturedAuth = config.headers.Authorization as string | undefined;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    };

    await api.get("/projects");
    expect(capturedAuth).toBeUndefined();
  });
});
