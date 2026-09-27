import express from "express";
import cors from "cors";
import prisma from "./prisma.js";
import projectRoutes from "./routes/project.routes.js";
import entryFieldRoutes from "./routes/entryField.routes.js";
import entryRoutes from "./routes/entry.routes.js";
import authRoutes from "./routes/auth.routes.js";
import googleCalendarRoutes from "./routes/googleCalendarRoutes.js";
import tagRoutes from "./routes/tag.routes.js";
import customStatisticRoutes from "./routes/customStatistic.routes.js";
import reminderRoutes from "./routes/reminder.routes.js";
import pushRoutes from "./routes/push.routes.js";
import { authLimiter, nonNegativeIntFromEnv } from "./middleware/rateLimit.middleware.js";

const app = express();

// Render terminates TLS at its own proxy, so req.ip is the proxy's address
// unless Express is told how many hops to trust — and every visitor would then
// share a single rate-limit bucket. Left at 0 locally, where there is no proxy
// and an X-Forwarded-For header would only be a way to spoof an address.
app.set("trust proxy", nonNegativeIntFromEnv("TRUST_PROXY_HOPS", process.env.NODE_ENV === "production" ? 1 : 0));

// ── Global middleware (must come before routes) ──────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:5173", 
      "http://127.0.0.1:5174",
      "https://31d62b64.coms3011a-logbook-digital-logbook.pages.dev",
      /^https:\/\/.*\.pages\.dev$/
    ],
    credentials: true,
  })
);
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────
app.use("/api", projectRoutes);
app.use("/api", entryFieldRoutes);
app.use("/api", entryRoutes);
app.use("/api", customStatisticRoutes);
// The limiter runs before the routes so its headers are on every auth reply.
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/google-calendar", googleCalendarRoutes);
app.use("/api", tagRoutes);
app.use("/api", reminderRoutes);
app.use("/api", pushRoutes);

// ── Utility routes ────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.send("Backend is running. Use /api/health or /api/db-check");
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db-check", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    res.json({
      status: "ok",
      message: "Successfully connected to Neon PostgreSQL via Prisma",
      time: rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ status: "error", message: "Failed to connect to database" });
  }
});

export default app;
