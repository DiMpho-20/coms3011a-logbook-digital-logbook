/**
 * Retrying an idempotent read whose connection died under it.
 *
 * Kept separate from prisma.ts, and free of any Prisma import, so the policy
 * that decides what gets a second chance can be tested on its own rather than
 * only through a live database.
 *
 * Why this exists: in the CI run of 2026-09-27 every one of the eight backend
 * failures was a read that timed out at the transport — four in loadHistory's
 * findFirst, three in the findUniqueOrThrow that takes the pre-edit snapshot
 * in updateEntry, one in getEntries' findMany. Several surfaced not as an
 * error but as a wrong answer downstream: an entry stuck at version 1, a time
 * summary reading 30 instead of 90, because the read failed inside a handler
 * that carried on regardless.
 *
 * It is also right beyond the test suite. A student should not see a 500
 * because one TCP connection went quiet between two of their queries, and a
 * question asked twice returns the same answer.
 */

/**
 * Failures where the statement never reached Postgres. The same set the
 * entriesListing suite retries on, kept deliberately narrow: a constraint
 * violation, or any other answer the database actually gave, is a real result
 * and must never be retried away.
 */
export const TRANSPORT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "P1001",
  "P1002",
  "P1017",
]);

/**
 * Operations safe to run again: they ask a question and change nothing.
 *
 * Writes are absent on purpose — a write that times out at the transport may
 * still have landed, so repeating it could duplicate data. Raw queries are
 * absent too, because $queryRawUnsafe could be anything at all.
 */
export const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export const MAX_READ_ATTEMPTS = 3;

export function isRetryableRead(operation: string): boolean {
  return READ_OPERATIONS.has(operation);
}

export function isTransportFailure(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && TRANSPORT_CODES.has(code);
}

/** How long to wait before attempt n + 1, so the pool can hand out another connection. */
export function retryDelayMs(attempt: number): number {
  return 150 * attempt;
}

/**
 * Run a read, retrying it only when the connection failed rather than the
 * query. Anything the database answered — including an error it chose to
 * return — is passed straight back on the first attempt.
 */
export async function withReadRetry<T>(
  operation: string,
  run: () => Promise<T>,
  options: { sleep?: (ms: number) => Promise<void>; onRetry?: (operation: string, attempt: number) => void } = {}
): Promise<T> {
  if (!isRetryableRead(operation)) return run();

  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= MAX_READ_ATTEMPTS || !isTransportFailure(error)) throw error;
      options.onRetry?.(operation, attempt);
      await sleep(retryDelayMs(attempt));
    }
  }
}
