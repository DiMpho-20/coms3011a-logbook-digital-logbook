import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Single-use credentials that travel by email or on paper.
 *
 * Password-reset tokens, email-verification tokens and 2FA recovery codes are
 * all the same shape of problem: the server must recognise a value it issued
 * without being able to reproduce it from what it stores. Previously the raw
 * token was written straight into the database, so a read of password_resets
 * or users was enough to take over any account with a reset in flight. Storing
 * a SHA-256 digest fixes that: the lookup still works, but the stored value is
 * no longer usable as the credential.
 *
 * SHA-256 rather than bcrypt is the right call here, and the reason is entropy.
 * bcrypt exists to make guessing a low-entropy human password expensive. These
 * values are 256 bits (tokens) or ~50 bits (recovery codes) of CSPRNG output,
 * so there is nothing to guess and no dictionary to run; a plain digest gives
 * the same security with an indexed, constant-time lookup instead of a table
 * scan comparing every row.
 *
 * Deliberately pure — no Prisma import — so it can be exercised without a
 * database.
 */

/** A 256-bit single-use token, hex encoded. This is the value that gets emailed. */
export function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

/** The digest to store. Never store, log, or return the raw token alongside it. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// 2FA recovery codes (BUG-005)
// ---------------------------------------------------------------------------

/**
 * Crockford-ish base32: the full alphabet minus I, L, O, 0 and 1.
 *
 * These get read off a screenshot or a scrap of paper months later, usually in
 * the mild panic of a lost phone, so the characters that get mistaken for one
 * another are simply not in the set.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const RECOVERY_CODE_COUNT = 10;
const GROUP_LENGTH = 5;
const GROUPS = 2;

/**
 * One code, as "XXXXX-XXXXX".
 *
 * randomInt is rejection-sampled by Node, so this is uniform over the alphabet
 * — unlike randomBytes()[i] % 31, which would quietly favour the first few
 * characters. Ten characters from 31 gives about 50 bits, which is far beyond
 * what the 2FA rate limiter would ever let an attacker work through.
 */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i += 1) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** A fresh set. Returned to the user exactly once, at the moment they are created. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, generateRecoveryCode);
}

/**
 * Fold away the differences that are not the user's fault: case, the separator,
 * and any spaces picked up in a copy-paste. "abcde fghjk" and "ABCDE-FGHJK" are
 * the same code, and someone locked out of their account should not have to
 * discover that on their own.
 */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The digest to store, normalised first so lookup matches whatever they typed. */
export function hashRecoveryCode(code: string): string {
  return hashToken(normaliseRecoveryCode(code));
}

/**
 * Whether a submitted value could be a recovery code at all.
 *
 * Used by /login/2fa to decide which branch to take, since that endpoint now
 * accepts either a 6-digit TOTP code or a recovery code in the same field. A
 * TOTP code is six digits and normalises to length 6; a recovery code
 * normalises to exactly ten characters from the alphabet above, so the two
 * cannot be confused.
 */
export function looksLikeRecoveryCode(code: string): boolean {
  const normalised = normaliseRecoveryCode(code);
  if (normalised.length !== GROUP_LENGTH * GROUPS) return false;
  return [...normalised].every((char) => ALPHABET.includes(char));
}
