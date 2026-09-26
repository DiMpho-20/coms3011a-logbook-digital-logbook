import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * TOTP secrets at rest (BUG-004).
 *
 * A TOTP secret is a bearer credential: anyone holding it can generate valid
 * codes forever, so storing it in plaintext meant a single read of the users
 * table handed over the second factor for every account that had enabled it.
 * This module wraps it in AES-256-GCM, following the envelope already used for
 * Google Calendar tokens in googleTokens.ts so there is one shape to reason
 * about rather than two.
 *
 * Deliberately pure — no Prisma import — so the round-trip can be exercised
 * without a database.
 */

const SECRET_VERSION = "v1";

/**
 * A versioned envelope: "v1.<iv>.<tag>.<ciphertext>", all base64url.
 *
 * Nothing else can be mistaken for one. A stored TOTP secret is bare base32
 * (RFC 4648: A-Z and 2-7), which contains no "." at all, so a legacy plaintext
 * row can never accidentally satisfy this pattern — which is what makes the
 * fallback in decryptTwoFactorSecret safe rather than a guess.
 */
const ENVELOPE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function encryptionKey(): Buffer {
  const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TWO_FACTOR_ENCRYPTION_KEY is not set. Refusing to store a two-factor " +
        "secret in plaintext. Set it in apps/backend/.env before enabling 2FA."
    );
  }
  // SHA-256 gives AES-256 a fixed-length key without imposing an encoding
  // requirement on deployment configuration.
  return createHash("sha256").update(secret).digest();
}

/** Whether a key is configured. Callers use this to skip opportunistic re-encryption. */
export function hasEncryptionKey(): boolean {
  return Boolean(process.env.TWO_FACTOR_ENCRYPTION_KEY);
}

/** Whether a stored value is already an encrypted envelope rather than legacy plaintext. */
export function isEncryptedSecret(value: string): boolean {
  return ENVELOPE.test(value);
}

/** Wrap a TOTP secret for storage. Throws if no key is configured. */
export function encryptTwoFactorSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Read a stored TOTP secret.
 *
 * Rows written before this fix landed hold the bare secret. Those are returned
 * unchanged rather than treated as corrupt: the alternative is locking every
 * existing 2FA user out of their own account on deploy, which is a worse
 * outcome than briefly tolerating the old shape. Callers should re-encrypt on
 * read (see the /login/2fa handler) so the plaintext rows drain away on their
 * own as people sign in.
 */
export function decryptTwoFactorSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;

  const [, iv, tag, ciphertext] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
