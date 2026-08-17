import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

// Neon Database check endpoint
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
    res.status(500).json({
      status: "error",
      message: "Failed to connect to the database",
    });
  }
});

// GET all vessel projects from Neon
app.get("/api/projects", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vessel_projects ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST a new vessel project to Neon
app.post("/api/projects", async (req, res) => {
  const { name, code, gt, owner, captain, homePort } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO vessel_projects (name, code, gt, owner, captain, home_port, status, entries)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 0)
       RETURNING *`,
      [name, code, gt, owner, captain, homePort]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
