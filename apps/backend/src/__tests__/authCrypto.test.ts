import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  encryptTwoFactorSecret,
  decryptTwoFactorSecret,
  isEncryptedSecret,
  hasEncryptionKey,
} from "../utils/twoFactorSecret.js";
import {
  generateRawToken,
  hashToken,
  generateRecoveryCode,
  generateRecoveryCodes,
  normaliseRecoveryCode,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "../utils/tokens.js";

// These two modules are deliberately free of Prisma, so this file needs no
// database and runs in milliseconds — the round-trip properties below are
// worth asserting on their own rather than only through an HTTP request.

const ORIGINAL_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY;
const TEST_KEY = "unit-test-two-factor-key";

// A realistic base32 TOTP secret, the shape otplib's generateSecret produces.
const PLAINTEXT_SECRET = "KRSXG5DJNZTQYYTBOJSXG4DPEBZXI4TB";

beforeEach(() => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
  else process.env.TWO_FACTOR_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("TOTP secret encryption (BUG-004)", () => {
  it("returns the original secret after a round trip", () => {
    const stored = encryptTwoFactorSecret(PLAINTEXT_SECRET);
    expect(decryptTwoFactorSecret(stored)).toBe(PLAINTEXT_SECRET);
  });

  it("does not leave the secret readable in what it stores", () => {
    const stored = encryptTwoFactorSecret(PLAINTEXT_SECRET);
    expect(stored).not.toContain(PLAINTEXT_SECRET);
    expect(stored.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh IV, so the same secret encrypts differently each time", () => {
    // Otherwise two users with the same secret would be visibly identical in
    // the table, and a repeated value would leak that a secret was unchanged.
    expect(encryptTwoFactorSecret(PLAINTEXT_SECRET)).not.toBe(
      encryptTwoFactorSecret(PLAINTEXT_SECRET)
    );
  });

  it("fits the two_factor_secret column", () => {
    expect(encryptTwoFactorSecret(PLAINTEXT_SECRET).length).toBeLessThanOrEqual(255);
  });

  it("rejects a tampered ciphertext rather than returning wrong plaintext", () => {
    const parts = encryptTwoFactorSecret(PLAINTEXT_SECRET).split(".");
    const bytes = Buffer.from(parts[3], "base64url");
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString("base64url");

    expect(() => decryptTwoFactorSecret(parts.join("."))).toThrow();
  });

  it("rejects an envelope encrypted under a different key", () => {
    const stored = encryptTwoFactorSecret(PLAINTEXT_SECRET);
    process.env.TWO_FACTOR_ENCRYPTION_KEY = "a-completely-different-key";

    expect(() => decryptTwoFactorSecret(stored)).toThrow();
  });

  describe("telling an envelope from a legacy plaintext row", () => {
    it("recognises its own output", () => {
      expect(isEncryptedSecret(encryptTwoFactorSecret(PLAINTEXT_SECRET))).toBe(true);
    });

    it("does not mistake a bare base32 secret for one", () => {
      // This is the property the plaintext fallback rests on: a TOTP secret
      // contains no ".", so it can never satisfy the envelope pattern.
      expect(isEncryptedSecret(PLAINTEXT_SECRET)).toBe(false);
    });

    it("reads a legacy plaintext secret back unchanged", () => {
      expect(decryptTwoFactorSecret(PLAINTEXT_SECRET)).toBe(PLAINTEXT_SECRET);
    });
  });

  describe("when no key is configured", () => {
    beforeEach(() => {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    });

    it("reports the key as missing", () => {
      expect(hasEncryptionKey()).toBe(false);
    });

    it("refuses to encrypt rather than storing plaintext", () => {
      expect(() => encryptTwoFactorSecret(PLAINTEXT_SECRET)).toThrow(
        /TWO_FACTOR_ENCRYPTION_KEY/
      );
    });

    it("still reads legacy plaintext, so existing users are not locked out", () => {
      expect(decryptTwoFactorSecret(PLAINTEXT_SECRET)).toBe(PLAINTEXT_SECRET);
    });
  });
});

describe("single-use token hashing", () => {
  it("issues a 256-bit token", () => {
    expect(generateRawToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issues a different token every time", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("stores a digest that is not the token", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically, so lookup by digest works", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it("gives different tokens different digests", () => {
    expect(hashToken(generateRawToken())).not.toBe(hashToken(generateRawToken()));
  });
});

describe("recovery codes (BUG-005)", () => {
  it("issues a full set", () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it("issues distinct codes", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("formats them as XXXXX-XXXXX", () => {
    expect(generateRecoveryCode()).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });

  it("leaves out the characters people confuse when reading them back", () => {
    // I, L, O, 0 and 1 are absent by design: these get transcribed from a
    // screenshot months later, usually while locked out.
    const codes = generateRecoveryCodes().join("");
    expect(codes).not.toMatch(/[ILO01]/);
  });

  it("accepts a code however the user happens to type it", () => {
    const code = generateRecoveryCode();
    const messy = code.replace("-", " ").toLowerCase();
    expect(hashRecoveryCode(messy)).toBe(hashRecoveryCode(code));
  });

  it("normalises away case and separators", () => {
    expect(normaliseRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normaliseRecoveryCode("ABCDE FGHJK")).toBe("ABCDEFGHJK");
  });

  it("stores a digest rather than the code", () => {
    const code = generateRecoveryCode();
    expect(hashRecoveryCode(code)).not.toContain(normaliseRecoveryCode(code));
  });

  describe("distinguishing a recovery code from a TOTP code", () => {
    it("recognises a generated recovery code", () => {
      expect(looksLikeRecoveryCode(generateRecoveryCode())).toBe(true);
    });

    it("does not mistake a 6-digit TOTP code for one", () => {
      // /login/2fa branches on this, so a false positive here would send a
      // valid authenticator code down the recovery-code path and fail the login.
      expect(looksLikeRecoveryCode("123456")).toBe(false);
    });

    it("rejects a ten-character string containing excluded letters", () => {
      expect(looksLikeRecoveryCode("ABCDE-FGHI0")).toBe(false);
    });

    it("rejects the wrong length", () => {
      expect(looksLikeRecoveryCode("ABCD-EFGH")).toBe(false);
      expect(looksLikeRecoveryCode("ABCDEF-GHJKM")).toBe(false);
    });
  });
});
