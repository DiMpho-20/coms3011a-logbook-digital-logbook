# BUG-006: 2FA Login Steps Not Cryptographically Linked

**Severity:** Medium (Security)
**Status:** Fixed
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

## Resolution

Fixed in `acdcf58` ("Encrypt TOTP secrets, hash single-use tokens, add 2FA
recovery codes").

`POST /api/auth/login` now issues a five-minute, purpose-scoped
`twoFactorToken` (`purpose: "2fa-pending"`, signed with `JWT_SECRET`) when the
password verifies, and `POST /api/auth/login/2fa` refuses to proceed without
it. The account is identified solely by that token — an email address in the
request body is no longer accepted — so step 2 can only follow a completed
step 1 for the same sign-in. The auth middleware (`verifyToken` in
`src/utils/auth.ts`) rejects any purpose-scoped token as a session, so the
hand-off token can never be replayed against protected routes.

The window is deliberately five minutes: it is a hand-off between two halves
of one sign-in, not a session, and only has to cover the time it takes to
read a code off a phone.

Regression coverage is in
`apps/backend/src/__tests__/twoFactorSecurity.test.ts`: five refusal cases
(no token, the old email-based contract, a session token submitted as the
hand-off, a token minted for a different purpose, a tampered token), plus
the positive completion and the not-a-session check. AUTHENTICATION.md
documents the two-step flow.
