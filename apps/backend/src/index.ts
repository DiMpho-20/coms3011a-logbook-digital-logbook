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
        user_id AS "userId", 
        name, 
        description, 
        status, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt" 
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
  const { name, description, userId, status } = req.body;
  try {
    const query = `
      INSERT INTO projects (name, description, user_id, status)
      VALUES ($1, $2, $3, $4)
      RETURNING 
        id, 
        user_id AS "userId", 
        name, 
        description, 
        status, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt";
    `;
    const values = [
      name, 
      description || null, 
      userId || null, 
      status || 'ACTIVE'
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
  const { name, description, status } = req.body;
  
  try {
    const query = `
      UPDATE projects 
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        updated_at = NOW()
      WHERE id = $4
      RETURNING 
        id, 
        user_id AS "userId", 
        name, 
        description, 
        status, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt";
    `;
    const values = [name, description, status, id];
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
