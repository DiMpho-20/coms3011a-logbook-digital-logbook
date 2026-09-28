# BUG-004: TOTP Secrets Stored Unencrypted

**Severity:** High (Security)
**Status:** Fixed
**Component:** Backend — `apps/backend/prisma/schema.prisma`
**Labels:** bug, security, 2fa

## Bug Description
The `twoFactorSecret` field in the `User` model stores TOTP secrets as plain text in the database. If the database is compromised, an attacker gains the ability to generate valid TOTP codes for every user with 2FA enabled, completely bypassing the second factor.

## Steps to Reproduce
1. Enable 2FA for a user via `POST /api/auth/2fa/setup`
2. Query the database: `SELECT "twoFactorSecret" FROM users WHERE email = '...'`
3. The secret is returned as plain text (e.g. `JBSWY3DPEHPK3PXP`)

## Expected Behaviour
TOTP secrets should be encrypted at rest using an application-level encryption key (e.g. AES-256-GCM), so that a database breach alone does not compromise 2FA.

## Actual Behaviour
Secrets are stored as-is and readable by anyone with database access.

## Environment
- **Schema field:** `User.twoFactorSecret` (String, nullable)
- **Documented in:** `apps/backend/AUTHENTICATION.md` (known limitations)

## Proposed Fix
1. Add an `ENCRYPTION_KEY` environment variable
2. Encrypt the TOTP secret before saving (AES-256-GCM)
3. Decrypt on read before verifying TOTP codes
4. Store the IV alongside the ciphertext

## Related
- Combined with BUG-003 (no rate limiting), an attacker with DB access could generate valid 2FA codes without any additional barriers

## Resolution

Fixed in `acdcf58` ("Encrypt TOTP secrets, hash single-use tokens, add 2FA
recovery codes").

Secrets are now wrapped in AES-256-GCM before they touch the database:
`src/utils/twoFactorSecret.ts` stores a versioned `v1.<iv>.<tag>.<ciphertext>`
envelope (all base64url) under `TWO_FACTOR_ENCRYPTION_KEY`, following the
envelope shape already used for Google Calendar tokens. If the key is not
configured, `POST /api/auth/2fa/setup` returns `503` rather than storing an
unprotected secret.

Rows written before the fix still hold bare base32 secrets. They are
deliberately still readable — locking out every existing 2FA user on deploy
would be a worse outcome — and are re-encrypted transparently the next time
their owner signs in with a TOTP code, so the plaintext rows drain away on
their own. The envelope pattern cannot collide with base32, which contains
no `.`, so the fallback is safe by construction rather than by hope.

Regression coverage is in `apps/backend/src/__tests__/authCrypto.test.ts`
(28 tests: round-trip, stored value unreadable, fresh IV per encryption,
tamper and wrong-key rejection, legacy-plaintext detection, refusal to
encrypt without a key). AUTHENTICATION.md documents the new behaviour,
including the key-loss caveat in its known-limitations section.
