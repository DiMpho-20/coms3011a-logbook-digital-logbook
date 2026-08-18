import express from "express";
import cors from "cors";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

app.get("/api/projects", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM projects ORDER BY created_at DESC;");
    res.json(result.rows);
  } catch (err: any) {
    try {
      const fallbackResult = await pool.query("SELECT * FROM projects;");
      res.json(fallbackResult.rows);
    } catch (fallbackErr: any) {
      console.error("GET /api/projects error:", fallbackErr);
      res.status(500).json({ error: fallbackErr.message });
    }
  }
});

app.post("/api/projects", async (req, res) => {
  const { name, description, status, user_id } = req.body;
  try {
    let targetUserId = user_id;
    if (!targetUserId) {
      const userRes = await pool.query("SELECT id FROM users LIMIT 1;");
      if (userRes.rows.length > 0) {
        targetUserId = userRes.rows[0].id;
      } else {
        return res.status(400).json({ error: "No valid user_id provided or found in database." });
      }
    }

    const query = `
      INSERT INTO projects (id, user_id, name, description, status, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      RETURNING *;
    `;
    const values = [targetUserId, name, description || "", status || "ACTIVE"];
    const result = await pool.query(query, values);
    
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("POST /api/projects error:", err);
    res.status(500).json({ error: err.message, detail: err.detail });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  try {
    const query = `
      UPDATE projects
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const values = [name, description, status, id];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("PUT /api/projects error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
