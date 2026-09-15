# BUG-004: TOTP Secrets Stored Unencrypted

**Severity:** High (Security)
**Status:** Open
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
