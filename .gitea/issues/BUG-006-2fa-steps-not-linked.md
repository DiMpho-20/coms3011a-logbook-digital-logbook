# BUG-006: 2FA Login Steps Not Cryptographically Linked

**Severity:** Medium (Security)
**Status:** Open
**Component:** Backend — `apps/backend/src/routes/auth.routes.ts`
**Labels:** bug, security, 2fa

## Bug Description
The two-step 2FA login flow (`POST /api/auth/login` then `POST /api/auth/login/2fa`) is sequential but not cryptographically bound. Step 2 does not re-verify that step 1 succeeded for the same session. An attacker who knows a user's email could potentially call step 2 directly with a valid TOTP code without completing step 1 first.

## Steps to Reproduce
1. Call `POST /api/auth/login/2fa` with a valid email and TOTP code without calling step 1 first
2. If the user has 2FA enabled and the TOTP code is valid, a JWT is issued

## Expected Behaviour
Step 2 should only succeed if step 1 was completed within a short time window for the same user. A pre-auth nonce or temporary token should link the two steps.

## Actual Behaviour
Step 2 independently verifies the TOTP code and issues a JWT without checking whether step 1 was completed.

## Environment
- **Affected endpoints:** `POST /api/auth/login`, `POST /api/auth/login/2fa`
- **Documented in:** `apps/backend/AUTHENTICATION.md` (known limitations)

## Proposed Fix
1. Step 1 returns a short-lived `preAuthToken` (signed with JWT_SECRET, 2-minute expiry)
2. Step 2 requires the `preAuthToken` in the request body
3. Step 2 verifies the preAuthToken before validating the TOTP code

## Related
- BUG-003 (no rate limiting) and BUG-004 (unencrypted secrets) compound this issue
