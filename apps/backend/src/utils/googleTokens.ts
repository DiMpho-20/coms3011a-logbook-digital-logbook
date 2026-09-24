import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_VERSION = "v1";

function encryptionKey(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be set before connecting Google Calendar.");
  }
  // A SHA-256 derivation gives AES-256 a fixed-length key without imposing a
  // fragile encoding requirement on deployment configuration.
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a token using AES-256-GCM, including a version and authentication tag. */
export function encryptGoogleToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypt a token previously written by encryptGoogleToken. */
export function decryptGoogleToken(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== TOKEN_VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Stored Google Calendar credentials are invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
