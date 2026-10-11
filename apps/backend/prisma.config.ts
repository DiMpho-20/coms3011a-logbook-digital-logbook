import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate deploy, migrate status, db execute) connects with
// this URL; the running app connects separately through DATABASE_URL (see
// src/prisma.ts).
//
// Migrations take a session-level advisory lock. Through Neon's pooled
// "-pooler" endpoint the lock and unlock can land on different server
// connections, so the lock is left held and every later `migrate deploy`
// times out (P1002) — the container then exits and the deploy fails. Set
// DIRECT_URL to the same database's direct endpoint (host without
// "-pooler") so migrations hold one real connection. Without DIRECT_URL,
// DATABASE_URL is used as before, which is what CI and local setups rely on.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set DATABASE_URL (and DIRECT_URL in production) before running Prisma commands.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
