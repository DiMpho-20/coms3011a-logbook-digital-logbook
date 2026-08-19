import { pool } from "./db.js";

async function test() {
  try {
    const res = await pool.query("SELECT NOW()");

    console.log(
      "✅ Connected to Neon successfully! Server Time:",
      res.rows[0].now
    );

    process.exit(0);
  } catch (err) {
    console.error("❌ Connection error:", err);
    process.exit(1);
  }
}

test();