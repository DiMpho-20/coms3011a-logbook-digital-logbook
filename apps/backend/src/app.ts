import express from "express";
import cors from "cors";
import prisma from "./prisma.js";
import projectRoutes from "./routes/project.routes.js";
import entryFieldRoutes from "./routes/entryField.routes.js";
import entryRoutes from "./routes/entry.routes.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

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
app.use("/api/auth", authRoutes);

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
