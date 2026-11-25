import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

const configuredSecret = process.env.JWT_SECRET;

// A missing secret in production is a deployment mistake, not something to
// paper over: every token this process issued would be worthless the moment
// it restarted, and users would be signed out without explanation. Refuse to
// start instead.
if (!configuredSecret && process.env.NODE_ENV === "production") {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start in production: session tokens " +
      "would be signed with a key invented at startup and every session would " +
      "end at the next restart."
  );
}

/**
 * Outside production the server still starts, but with a secret generated for
 * this process rather than a constant compiled into the repository.
 *
 * The constant this replaces ("your-fallback-secret-key") was the whole of
 * BUG-002: anyone who had read the source could forge a token for any account
 * on any deployment that had forgotten to set the variable. A random secret
 * removes that even where the guard above does not fire — a deployment that
 * neglects NODE_ENV now merely loses its sessions on restart, rather than
 * signing them with a key the world can look up.
 *
 * Read once at module load, deliberately: tokens signed earlier in a process
 * must stay verifiable for its lifetime.
 */
const JWT_SECRET = configuredSecret ?? randomBytes(48).toString("hex");

if (!configuredSecret && process.env.NODE_ENV !== "test") {
  console.warn(
    "[auth] JWT_SECRET is not set. Signing tokens with a secret generated for " +
      "this process only — sessions will not survive a restart. Set JWT_SECRET " +
      "in apps/backend/.env to keep them."
  );
}

// Hash a plain password before saving to Prisma
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Compare plain password against stored hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Generate JWT session token.
//
// The token carries the account's current tokenVersion. requireAuth compares it
// with the database on every request, so incrementing that column — on logout,
// or on a password reset — is what makes a stateless token revocable.
export function generateToken(userId: string, tokenVersion = 0): string {
  return jwt.sign({ userId, ver: tokenVersion }, JWT_SECRET, { expiresIn: "7d" });
}

/** What a session token asserts, once its signature has been checked. */
export interface SessionClaims {
  userId: string;
  tokenVersion: number;
}

// Verify JWT token from authorization header
//
// A token minted before sessions carried a version has no `ver` claim and is
// read as 0, which is what the column defaults to — so the change itself signs
// nobody out. Anything that is not a non-negative integer is treated the same
// way rather than trusted.
export function verifyToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId?: string;
      purpose?: string;
      ver?: unknown;
    };
    // Purpose-scoped tokens (e.g. OAuth state, which travels in URLs) share
    // the signing key but must never be accepted as a session.
    if (payload.purpose !== undefined || typeof payload.userId !== "string") return null;

    const version = payload.ver;
    const tokenVersion =
      typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0;

    return { userId: payload.userId, tokenVersion };
  } catch {
    return null;
  }
}

/** Bind a short-lived third-party OAuth callback to the user who started it. */
export function generateOAuthState(userId: string): string {
  return jwt.sign({ userId, purpose: "oauth-state" }, JWT_SECRET, { expiresIn: "10m" });
}

/** Returns the initiating user only for an unexpired, correctly-scoped state. */
export function verifyOAuthState(state: string): string | null {
  try {
    const payload = jwt.verify(state, JWT_SECRET) as { userId?: string; purpose?: string };
    return payload.purpose === "oauth-state" && typeof payload.userId === "string"
      ? payload.userId
      : null;
  } catch {
    return null;
  }
}

/**
 * Bind the second step of a two-factor login to the first (BUG-006).
 *
 * /login/2fa used to take an email address and a TOTP code. Nothing in that
 * request proved the password step had ever happened, so possession of a code
 * alone was enough to obtain a session: two-factor authentication had become a
 * substitute for the password rather than an addition to it. This token is
 * issued only after the password verifies, and /login/2fa will not proceed
 * without one.
 *
 * Five minutes is deliberately short. It is a hand-off between two halves of
 * one sign-in, not a session, and the window only has to cover the time it
 * takes to read a code off a phone.
 */
export function generateTwoFactorPendingToken(userId: string): string {
  return jwt.sign({ userId, purpose: "2fa-pending" }, JWT_SECRET, { expiresIn: "5m" });
}

/** Returns the user who completed the password step, or null for anything else. */
export function verifyTwoFactorPendingToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string; purpose?: string };
    return payload.purpose === "2fa-pending" && typeof payload.userId === "string"
      ? payload.userId
      : null;
  } catch {
    return null;
  }
}
