import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("🚀 Backend is running");
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /api/projects
app.get("/api/projects", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        code, 
        title, 
        description, 
        assigned_to AS "assignedTo", 
        entries_count AS "entriesCount", 
        status 
      FROM projects 
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST /api/projects
app.post("/api/projects", async (req, res) => {
  const { code, title, description, assignedTo, status } = req.body;
  try {
    const query = `
      INSERT INTO projects (code, title, description, assigned_to, status, entries_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, code, title, description, assigned_to AS "assignedTo", status, entries_count AS "entriesCount";
    `;
    const values = [
      code, 
      title, 
      description || '', 
      assignedTo || 'Unassigned', 
      status || 'ACTIVE', 
      0
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PUT /api/projects/:id
app.put("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, assignedTo, status } = req.body;
  
  try {
    const query = `
      UPDATE projects 
      SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assigned_to = COALESCE($3, assigned_to),
        status = COALESCE($4, status)
      WHERE id = $5
      RETURNING id, code, title, description, assigned_to AS "assignedTo", status, entries_count AS "entriesCount";
    `;
    const values = [title, description, assignedTo, status, id];
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
