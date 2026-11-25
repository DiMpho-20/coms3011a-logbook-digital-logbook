import express from "express";
import helmet from "helmet";
import cors from "cors";
import projectRoutes from "./routes/project.routes.js";
import entryFieldRoutes from "./routes/entryField.routes.js";
import entryRoutes from "./routes/entry.routes.js";
import authRoutes from "./routes/auth.routes.js";
import googleCalendarRoutes from "./routes/googleCalendarRoutes.js";
import tagRoutes from "./routes/tag.routes.js";
import customStatisticRoutes from "./routes/customStatistic.routes.js";
import automationRuleRoutes from "./routes/automationRule.routes.js";
import reminderRoutes from "./routes/reminder.routes.js";
import pushRoutes from "./routes/push.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import savedFilterRoutes from "./routes/savedFilter.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import assistantRoutes from "./routes/assistant.routes.js";
import gradesRoutes from "./routes/grades.routes.js";
import importRoutes from "./routes/import.routes.js";
import { authLimiter, nonNegativeIntFromEnv } from "./middleware/rateLimit.middleware.js";
import { corsOptionsFor, readCorsAllowlist } from "./middleware/cors.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const app = express();

// Render terminates TLS at its own proxy, so req.ip is the proxy's address
// unless Express is told how many hops to trust — and every visitor would then
// share a single rate-limit bucket. Left at 0 locally, where there is no proxy
// and an X-Forwarded-For header would only be a way to spoof an address.
app.set("trust proxy", nonNegativeIntFromEnv("TRUST_PROXY_HOPS", process.env.NODE_ENV === "production" ? 1 : 0));

// ── Global middleware (must come before routes) ──────────────────────
// Response headers only. The API returns JSON to a known origin, so the CSP
// here governs documents served by mistake rather than anything the frontend
// loads; every response carrying nosniff and a frame denial costs nothing.
app.use(helmet());

// Who may call this API from a browser is configuration, not a constant: the
// allowlist is CORS_ORIGINS (see .env.example). An unset list in production
// grants nothing, which is why the warning below exists — a silent, total CORS
// failure is harder to diagnose than a loud line at boot.
const corsAllowlist = readCorsAllowlist();
if (
  process.env.NODE_ENV === "production" &&
  corsAllowlist.origins.length === 0 &&
  !corsAllowlist.pattern
) {
  console.warn(
    "[cors] CORS_ORIGINS is unset in production: every cross-origin browser request will be refused."
  );
}
app.use(cors(corsOptionsFor(corsAllowlist)));
// Express's default 100 KB would turn away avatars well under the 512 KB cap
// in profileInput.ts with a bare 413, before that check could explain itself.
// A whole-logbook backup is one request (issue #87) and outgrows 1 MB long
// before it is unreasonable. Registered first, so the general parser below
// finds the body already read and leaves it alone.
app.use("/api/import", express.json({ limit: "10mb" }));
app.use(express.json({ limit: "1mb" }));

// ── API routes ────────────────────────────────────────────────────────
app.use("/api", projectRoutes);
app.use("/api", entryFieldRoutes);
app.use("/api", entryRoutes);
app.use("/api", customStatisticRoutes);
app.use("/api", automationRuleRoutes);
// The limiter runs before the routes so its headers are on every auth reply.
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/google-calendar", googleCalendarRoutes);
app.use("/api", tagRoutes);
app.use("/api", reminderRoutes);
app.use("/api", pushRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", savedFilterRoutes);
app.use("/api", profileRoutes);
app.use("/api", assistantRoutes);
app.use("/api", importRoutes);
// Its own mount path, because the grades router applies requireAuth to every
// request it sees (see grades.routes.ts).
app.use("/api/grades", gradesRoutes);

// ── Utility routes ────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.send("Backend is running. Use /api/health");
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── No route matched ──────────────────────────────────────────────────
// Before this, anything unknown fell through to Express's HTML error page,
// which the axios client could only report as a parse failure.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
