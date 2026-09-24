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

// Generate JWT session token
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

// Verify JWT token from authorization header
export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string; purpose?: string };
    // Purpose-scoped tokens (e.g. OAuth state, which travels in URLs) share
    // the signing key but must never be accepted as a session.
    if (payload.purpose !== undefined || typeof payload.userId !== "string") return null;
    return payload as { userId: string };
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
