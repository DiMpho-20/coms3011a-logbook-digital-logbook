import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withReadRetry } from "./utils/readRetry.js";

// Load .env explicitly from apps/backend/.env (before creating the client)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * The pool behind the driver adapter.
 *
 * DATABASE_URL points at Neon's -pooler endpoint (PgBouncer in transaction
 * mode), reached over the public internet from the CI runner. Connections on
 * that path go quiet and get dropped, and without TCP keepalive nothing
 * notices until a query is written to a socket the far end has forgotten.
 *
 * Honest status: keepAlive is standard practice for a long-lived pool against
 * a pooler, and it is kept for that reason — but it did NOT fix the ETIMEDOUT
 * failures it was added for. The run after it went from three failures to
 * eight. It is no longer claimed as the cause; see the retry below, which is
 * what the evidence actually supports.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,

  // Default is 0, meaning wait forever for a free connection. A request that
  // cannot get one should fail quickly and visibly rather than hang.
  connectionTimeoutMillis: 15_000,

  // Retire our own idle connections before the pooler decides to.
  idleTimeoutMillis: 10_000,
});

/**
 * The retry policy lives in utils/readRetry.ts, with no Prisma import, so it
 * can be tested on its own rather than only through a live database.
 */
const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      return withReadRetry(operation, () => query(args), {
        onRetry: (name, attempt) =>
          console.warn(`[prisma] ${name} failed at the transport (attempt ${attempt}); retrying`),
      });
    },
  },
  // An extended client is structurally a PrismaClient with extra behaviour
  // around queries. The cast keeps every existing call site and helper
  // signature (createFormatVersion takes a PrismaClient) working unchanged.
}) as unknown as PrismaClient;

export default prisma;
