import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Load .env explicitly from apps/backend/.env (before creating the client)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * The pool behind the driver adapter.
 *
 * Passing only a connection string leaves every pg.Pool default in place, and
 * one of those defaults is the cause of the ETIMEDOUT failures that have been
 * breaking CI: keepAlive is false.
 *
 * DATABASE_URL points at Neon's -pooler endpoint, which is PgBouncer in
 * transaction mode. It recycles and drops client connections that have gone
 * quiet, and so does any NAT on the path out of a CI runner. Without TCP
 * keepalive nothing notices: the socket stays open as far as this process is
 * concerned, the next query is written into a connection the other end has
 * already forgotten, and it fails only when the kernel gives up retransmitting.
 * That is why the error is ETIMEDOUT on an established connection rather than a
 * refusal, why it lands on unrelated models (LogbookEntry here, User there),
 * and why it looks like random flakiness.
 *
 * I previously wrote this off as infrastructure in docs/testing.md. That was
 * wrong — the pool was simply never configured.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,

  // The fix. Probe a quiet connection so a dropped one is discovered and
  // replaced in seconds, instead of surfacing as a timeout on the next query.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,

  // Default is 0, meaning wait forever for a free connection. A request that
  // cannot get one should fail quickly and visibly rather than hang.
  connectionTimeoutMillis: 15_000,

  // Retire our own idle connections before the pooler decides to.
  idleTimeoutMillis: 10_000,

  // Default is 10 per pool. The test run starts four worker processes, each
  // with its own client and therefore its own pool, so the default allows up
  // to forty connections against the pooler for work that is latency-bound
  // rather than throughput-bound. Five apiece is ample and far gentler.
  max: 5,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
