import axios from "axios";

// A deployed static build has no dev proxy, so it needs an absolute URL. The
// one it uses is named in VITE_API_URL (see .env.production); the literal is
// only what a build packaged without that variable falls back on, and was the
// only value this file honoured before.
const DEFAULT_API_URL = "https://digital-logbook-backend-latest.onrender.com/api";

export const api = axios.create({
  // Local Vite dev server proxies /api to localhost:3000 (see vite.config.ts).
  baseURL: import.meta.env.DEV
    ? "/api"
    : import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to requests if stored in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints where 401 means "wrong credentials", not a dead session —
// logging the user out on those would be wrong (e.g. a mistyped password
// during account deletion).
const CREDENTIAL_401_ROUTES = [
  "/auth/login",
  "/auth/login/2fa",
  "/auth/account",
  "/auth/2fa/disable",
  // A wrong password here is the user mistyping, not an expired session —
  // without this the interceptor would sign them out mid-task.
  "/auth/2fa/recovery-codes",
];

// A 401 from any other endpoint means the session token is missing, invalid,
// or expired (JWTs last 7 days). Clear the stale session and return to the
// login page instead of leaving every page erroring with "status code 401".
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || "";

    if (status === 401 && !CREDENTIAL_401_ROUTES.some((r) => url.includes(r))) {
      localStorage.removeItem("token");
      localStorage.removeItem("logbook-name");
      localStorage.removeItem("logbook-email");
      localStorage.removeItem("logbook-avatar");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?expired=1";
      }
    }

    return Promise.reject(error);
  }
);
