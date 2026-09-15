# BUG-005: No 2FA Recovery/Backup Codes

**Severity:** High
**Status:** Open
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
