import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";
import authRoutes from "./routes/auth.routes.js";
import entryFieldRoutes from "./routes/entryField.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (Must be registered before routes)
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api", entryFieldRoutes);

// Root welcome route
app.get("/", (_req, res) => {
  res.send("🚀 Backend is running. Use /api/health, /api/db-check, or /api/projects");
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Database connection check
app.get("/api/db-check", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "ok",
      message: "Successfully connected to Neon PostgreSQL!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ status: "error", message: "Failed to connect to database" });
  }
});

// GET /api/projects
app.get("/api/projects", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM projects ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST /api/projects
app.post("/api/projects", async (req, res) => {
  const { code, name, gt, owner, captain, homePort, status, entries } = req.body;
  try {
    const query = `
      INSERT INTO projects (code, name, gt, owner, captain, home_port, status, entries)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, code, name, gt, owner, captain, home_port AS "homePort", status, entries;
    `;
    const values = [code, name, gt, owner, captain, homePort, status || 'ACTIVE', entries || 0];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});