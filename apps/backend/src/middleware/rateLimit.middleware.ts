import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

const MINUTE = 60_000;

/** Read a positive integer from the environment, falling back on anything unusable. */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`[rate-limit] ${name}="${raw}" is not a positive integer; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Read a non-negative integer — trust-proxy hops may legitimately be 0. */
export function nonNegativeIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(`[rate-limit] ${name}="${raw}" is not a non-negative integer; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/**
 * Limits are off under test by default: auth.test.ts registers and logs in far
 * more often than any of these windows allow, and turning them on there would
 * fail the suite for reasons that have nothing to do with the code under test.
 * The limiter's own behaviour is covered separately, by a suite that sets
 * RATE_LIMIT_DISABLED=false to switch it back on.
 *
 * An explicit RATE_LIMIT_DISABLED always wins, so this can be forced either way.
 */
export function rateLimitingDisabled(): boolean {
  const explicit = process.env.RATE_LIMIT_DISABLED;
  if (explicit !== undefined && explicit.trim() !== "") return explicit === "true";
  return process.env.NODE_ENV === "test";
}

interface LimiterConfig {
  windowMs: number;
  limit: number;
  message: string;
}

/**
 * Both header styles are emitted deliberately. FEAT-007 asks for
 * X-RateLimit-Limit and X-RateLimit-Remaining, which are the legacy headers,
 * while the draft standard uses the unprefixed RateLimit-* names. Sending both
 * satisfies the acceptance criteria without pinning clients to the older form.
 *
 * Retry-After is set by the library itself on a 429.
 */
export function createRateLimiter({ windowMs, limit, message }: LimiterConfig): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: true,
    message: { error: message },
    // Evaluated per request, so the switch can be flipped at runtime.
    skip: () => rateLimitingDisabled(),
  });
}

const TOO_MANY = "Too many attempts. Please wait and try again.";

/**
 * A generous limit across every auth route, so that rate-limit headers appear
 * on all auth responses rather than only the three throttled ones.
 */
export const authLimiter = createRateLimiter({
  windowMs: positiveIntFromEnv("RATE_LIMIT_AUTH_WINDOW_MINUTES", 15) * MINUTE,
  limit: positiveIntFromEnv("RATE_LIMIT_AUTH_MAX", 100),
  message: TOO_MANY,
});

/** Password guessing. */
export const loginLimiter = createRateLimiter({
  windowMs: positiveIntFromEnv("RATE_LIMIT_LOGIN_WINDOW_MINUTES", 15) * MINUTE,
  limit: positiveIntFromEnv("RATE_LIMIT_LOGIN_MAX", 20),
  message: "Too many sign-in attempts. Please wait and try again.",
});

/** A six-digit TOTP code is a million guesses, so this is tighter than login. */
export const twoFactorLimiter = createRateLimiter({
  windowMs: positiveIntFromEnv("RATE_LIMIT_2FA_WINDOW_MINUTES", 15) * MINUTE,
  limit: positiveIntFromEnv("RATE_LIMIT_2FA_MAX", 10),
  message: "Too many verification attempts. Please wait and try again.",
});

/** Registration spam. */
export const registerLimiter = createRateLimiter({
  windowMs: positiveIntFromEnv("RATE_LIMIT_REGISTER_WINDOW_MINUTES", 60) * MINUTE,
  limit: positiveIntFromEnv("RATE_LIMIT_REGISTER_MAX", 5),
  message: "Too many accounts created from this address. Please wait and try again.",
});

/** Each help-assistant question spends free-tier Gemini quota shared by everyone. */
export const assistantLimiter = createRateLimiter({
  windowMs: positiveIntFromEnv("RATE_LIMIT_ASSISTANT_WINDOW_MINUTES", 10) * MINUTE,
  limit: positiveIntFromEnv("RATE_LIMIT_ASSISTANT_MAX", 30),
  message: "You've asked the assistant a lot of questions. Please wait a few minutes and try again.",
});
