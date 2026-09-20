import axios from "axios";

export const api = axios.create({
  // Local Vite dev server proxies /api to localhost:3000 (see vite.config.ts);
  // a deployed static build has no such proxy, so it talks to Render directly.
  baseURL: import.meta.env.DEV
    ? "/api"
    : "https://digital-logbook-backend-latest.onrender.com/api",
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
