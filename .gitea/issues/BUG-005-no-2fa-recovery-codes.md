# BUG-005: No 2FA Recovery/Backup Codes

**Severity:** High
**Status:** Fixed
**Component:** Backend — `apps/backend/src/routes/auth.routes.ts`
**Labels:** bug, 2fa, account-recovery

## Bug Description
If a user loses their authenticator device (phone lost/broken), they cannot complete login when 2FA is enabled. The `POST /api/auth/login/2fa` endpoint requires a valid TOTP code, and disabling 2FA via `POST /api/auth/2fa/disable` requires being logged in first. There is no way for the user to recover their account without administrator intervention.

## Steps to Reproduce
1. Enable 2FA on an account
2. Clear browser localStorage (simulating a new device)
3. Attempt to login — the server returns `{ requiresTwoFactor: true }`
4. Without the authenticator app, there is no way to proceed

## Expected Behaviour
Users should have backup/recovery codes generated during 2FA setup that can be used as a one-time alternative to TOTP codes.

## Actual Behaviour
Account recovery requires a database administrator to manually clear the `twoFactorSecret` column.

## Environment
- **Affected flow:** Login step 2 + 2FA disable
- **Documented in:** `apps/backend/AUTHENTICATION.md` (known limitations)

## Proposed Fix
1. Generate 8 one-time backup codes during `POST /api/auth/2fa/setup`
2. Store hashed backup codes in a new `two_factor_backup_codes` table
3. Add `POST /api/auth/login/backup` endpoint accepting a backup code
4. Each backup code is single-use and deleted after consumption

## Related
- BUG-003 (no rate limiting) makes TOTP brute-force feasible without backup codes
- BUG-004 (unencrypted secrets) means the admin recovery path exposes secrets in the DB

## Resolution

Fixed in `acdcf58` (backend), with the UI carried through in `74dfa9f`.

Ten single-use recovery codes are issued exactly once, when 2FA is enabled at
`POST /api/auth/2fa/verify-setup` — the only response in which they are ever
readable. The database stores SHA-256 digests in the
`two_factor_recovery_codes` table, never the codes themselves.
`POST /api/auth/login/2fa` accepts a recovery code anywhere a TOTP code is
accepted (recognised by shape, normalised for case and hyphenation), and
spending is atomic: the row's `used_at` is only set if it was still `NULL`,
so the same code cannot be replayed even by two concurrent requests.

`POST /api/auth/2fa/recovery-codes` regenerates a fresh set — password-gated,
and invalidating every previous code — and disabling 2FA deletes all codes,
because a stale code must not unlock a later, unrelated 2FA setup. Together
these mean the administrator-clears-the-column recovery path is only needed
when a user loses both the authenticator *and* all ten codes.

Regression coverage is in
`apps/backend/src/__tests__/twoFactorSecurity.test.ts` (21 tests: full set
issued, digests stored, remaining count reported, formatting-tolerant
sign-in, replay refused, regeneration gated and invalidating, codes discarded
on disable). AUTHENTICATION.md documents the flows.
